import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { env } from "@/config/env";
import { ApiError, type FieldError } from "@/shared/errors/api-error";
import { toFieldErrors } from "@/shared/utils/z-parse";
import { ChainMisconfiguredError, ChainUnreachableError } from "@/lib/chain/client";
import { IndexerBusyError, IndexerUnreachableError } from "@/lib/indexer/client";
import { LogoStoreUnreachableError } from "@/lib/logo-store/client";
import { getContext } from "@/lib/context";
import { logger } from "@/lib/logger";

// Every failure leaves this API in one shape:
//
//   { success: false, statusCode, code, message, errors?, requestId?, stack? }
//
// code is what a client branches on, message is for a person, errors names each
// field a validation failure rejected, and requestId is what a support request quotes
// so an operator can find the log lines. The stack is sent only by a process that is
// not deployed, because staging is public too.
const sendFailure = (res: Response, error: ApiError, stack?: string) => {
  res.status(error.statusCode).json({
    success: false,
    statusCode: error.statusCode,
    code: error.code,
    message: error.message,
    ...(error.details && { errors: error.details }),
    ...(getContext()?.requestId && { requestId: getContext()?.requestId }),
    ...(!env.isDeployed && stack && { stack }),
  });
};

// src/lib/chain names what went wrong and knows nothing about HTTP. The status, and
// the sentence a caller reads, are decided here because the response body is where
// this API's contract is.
//
// A dead node is worth retrying and says so. A factory address of ours that is
// wrong is not the caller's to fix, so they get the plain 500.
const fromChain = (err: Error) => {
  if (err instanceof ChainUnreachableError)
    return ApiError.unavailable(
      "Could not reach the chain. Try again shortly.",
      "CHAIN_UNAVAILABLE",
    );

  if (err instanceof ChainMisconfiguredError) return ApiError.internal();

  return null;
};

// The market routes and the graduation read behind the agent, its previews and its
// connection read the indexer, so only they answer this 503. Any other indexer
// failure, a renamed column included, is ours and leaves as the plain 500.
//
// A busy indexer lane is not an outage: the indexer answers, and this backend is
// reading it as fast as it allows. It is a 503 all the same, because the overload is
// ours and not the caller's, and a second later is worth trying.
const fromIndexer = (err: Error) => {
  if (err instanceof IndexerUnreachableError)
    return ApiError.unavailable(
      "Could not reach the indexer. Try again shortly.",
      "INDEXER_UNAVAILABLE",
    );

  if (err instanceof IndexerBusyError)
    return ApiError.unavailable(
      "The indexer is busy. Try again in a second.",
      "INDEXER_BUSY",
    );

  return null;
};

// Only the logo route stores anything, so only it answers this 503. The picture was
// already checked by then, so the failure is the store's and the upload is worth
// repeating: nothing was recorded against a file that never arrived.
const fromLogoStore = (err: Error) =>
  err instanceof LogoStoreUnreachableError
    ? ApiError.unavailable(
        "Could not reach the logo store. Try again shortly.",
        "LOGO_STORE_UNAVAILABLE",
      )
    : null;

// How long a caller should wait before asking again after a busy lane, in seconds.
const BUSY_RETRY_AFTER = "1";

// The two Prisma failures a well formed request can cause. A unique violation is two
// requests racing for the same row, and a missing row is one deleted underneath the
// request. Anything else Prisma throws is ours, and its message names tables and
// columns, so it leaves as the plain 500 and is logged in full.
const fromPrisma = (err: Error) => {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;

  if (err.code === "P2002")
    return ApiError.conflict(
      "That conflicts with a record that already exists.",
      "UNIQUE_VIOLATION",
    );

  if (err.code === "P2025") return ApiError.notFound("That record no longer exists.");

  return null;
};

// What express.json raises. The parser marks a failure the caller caused with a 4xx
// status and expose: true, and names it with a type.
interface ParserError extends Error {
  status?: number;
  expose?: boolean;
  type?: string;
}

const fromParser = (err: ParserError) => {
  if (!err.expose || typeof err.status !== "number" || err.status >= 500) return null;

  if (err.type === "entity.parse.failed")
    return ApiError.badRequest("The request body is not valid JSON.", "MALFORMED_JSON");

  if (err.type === "entity.too.large")
    return new ApiError(413, "The request body is too large.", {
      code: "PAYLOAD_TOO_LARGE",
    });

  return new ApiError(err.status, err.message);
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    ApiError.notFound(
      `Route not found: ${req.method} ${req.originalUrl}`,
      "ROUTE_NOT_FOUND",
    ),
  );
};

const logRejection = (error: ApiError, cause: Error) => {
  // 5xx are real failures, 4xx are expected business rejections. Request context is
  // attached automatically, so a domain file never logs its own rejection.
  if (error.statusCode >= 500) {
    logger.error(cause.message, {
      statusCode: error.statusCode,
      code: error.code,
      stack: cause.stack,
    });
  } else {
    logger.warn(error.message, { statusCode: error.statusCode, code: error.code });
  }
};

export const errorHandler: ErrorRequestHandler = (err: Error, _req, res, next) => {
  // A response already on the wire cannot take a second status. Express closes the
  // connection itself when handed the error.
  if (res.headersSent) {
    next(err);
    return;
  }

  // Safety net: zParse already turns validation failures into an ApiError, so this
  // only catches a schema parsed somewhere else.
  if (err instanceof ZodError) {
    const details: FieldError[] = toFieldErrors(err);
    const error = ApiError.validation("Validation error", details);
    logRejection(error, err);
    sendFailure(res, error);
    return;
  }

  const chain = fromChain(err);

  if (chain) {
    logRejection(chain, err);

    // A misconfigured launchpad names our address in its message, and so in the first
    // line of its stack, so neither reaches the caller. An unreachable node has nothing
    // to hide and keeps the stack every other failure carries outside a deployment.
    const stack = err instanceof ChainMisconfiguredError ? undefined : err.stack;

    sendFailure(res, chain, stack);
    return;
  }

  if (err instanceof ApiError) {
    logRejection(err, err);
    sendFailure(res, err, err.stack);
    return;
  }

  const known =
    fromIndexer(err) ?? fromLogoStore(err) ?? fromPrisma(err) ?? fromParser(err);

  if (known) {
    logRejection(known, err);
    if (err instanceof IndexerBusyError) res.set("Retry-After", BUSY_RETRY_AFTER);
    sendFailure(res, known);
    return;
  }

  logger.error("Unhandled error", { error: err.message, stack: err.stack });

  sendFailure(res, ApiError.internal(), err.stack);
};
