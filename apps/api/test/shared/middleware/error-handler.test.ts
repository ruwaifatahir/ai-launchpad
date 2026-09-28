import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { type ZodError, z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { ApiError, errorHandler } from "@/shared";
import { ChainMisconfiguredError, ChainUnreachableError } from "@/lib/chain/client";
import { logger } from "@/lib/logger";
import { TEST_ENV } from "@test/helpers/env.mock";

const factory = TEST_ENV.FACTORY_ADDRESS as string;

type Body = {
  statusCode: number;
  code: string;
  message: string;
  stack?: string;
  errors?: { path: string; message: string }[];
};

const answer = (error: Error) => {
  const json = vi.fn();
  const res = {
    headersSent: false,
    status: vi.fn(() => ({ json })),
  } as unknown as Response;

  errorHandler(error, {} as Request, res, vi.fn() as NextFunction);

  return {
    status: vi.mocked(res.status).mock.calls[0]?.[0],
    body: json.mock.calls[0]?.[0] as Body,
  };
};

describe("errorHandler", () => {
  it("answers 503 when the chain could not be read, because the caller loses nothing by trying again", () => {
    const { status, body } = answer(new ChainUnreachableError(new Error("fetch failed")));

    expect(status).toBe(503);
    expect(body.message).toBe("Could not reach the chain. Try again shortly.");
  });

  it("answers 500 for a factory address of ours that is wrong, because nothing the caller does fixes it", () => {
    const { status, body } = answer(new ChainMisconfiguredError(new Error("no data")));

    expect(status).toBe(500);
    expect(body.message).toBe("Internal server error");
  });

  it("never names the factory address in the body, because our configuration is not the caller's to read", () => {
    const { body } = answer(new ChainMisconfiguredError(new Error("no data")));

    expect(JSON.stringify(body)).not.toContain(factory);
  });

  it("keeps the stack on a 503 outside production, because an unreachable node has nothing to hide", () => {
    const { body } = answer(new ChainUnreachableError(new Error("fetch failed")));

    expect(body.stack).toContain("ChainUnreachableError");
  });

  it("logs the chain error's own message, so an operator reads the factory address the caller never sees", () => {
    answer(new ChainMisconfiguredError(new Error("no data")));

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(factory),
      expect.anything(),
    );
  });

  it("leaves an ApiError with the status the domain chose, so naming a chain failure first steals nothing", () => {
    const { status, body } = answer(
      ApiError.forbidden("That token belongs to another creator."),
    );

    expect(status).toBe(403);
    expect(body.message).toBe("That token belongs to another creator.");
  });

  it("gives a failure it cannot name a shaped 500 rather than an unshaped one", () => {
    const { status, body } = answer(new Error("something else entirely"));

    expect(status).toBe(500);
    expect(body).toMatchObject({ success: false, message: "Internal server error" });
  });

  it("gives every failure a code a client can branch on, derived from the status when the domain names none", () => {
    expect(answer(ApiError.notFound()).body.code).toBe("NOT_FOUND");
    expect(answer(ApiError.conflict("x", "AGENT_STOPPED")).body.code).toBe(
      "AGENT_STOPPED",
    );
    expect(answer(new Error("boom")).body.code).toBe("INTERNAL_ERROR");
  });

  it("sends no stack from a deployed process, staging included, because staging is as public as production", () => {
    TEST_ENV.isDeployed = true;

    expect(answer(new Error("boom")).body.stack).toBeUndefined();
    expect(answer(ApiError.badRequest("no")).body.stack).toBeUndefined();
  });

  it("answers a unique violation with a 409, because it is two requests racing for one row rather than a fault of ours", () => {
    const { status, body } = answer(
      new Prisma.PrismaClientKnownRequestError('raw prisma text naming "agents"', {
        code: "P2002",
        clientVersion: "6",
      }),
    );

    expect(status).toBe(409);
    expect(body.code).toBe("UNIQUE_VIOLATION");
    expect(JSON.stringify(body)).not.toContain("agents");
  });

  it("answers a row deleted underneath the request with a 404", () => {
    const { status } = answer(
      new Prisma.PrismaClientKnownRequestError('raw prisma text naming "agents"', {
        code: "P2025",
        clientVersion: "6",
      }),
    );

    expect(status).toBe(404);
  });

  it("leaves any other Prisma failure as the plain 500, because its message names our tables", () => {
    TEST_ENV.isDeployed = true;
    const { status, body } = answer(
      new Prisma.PrismaClientKnownRequestError('raw prisma text naming "agents"', {
        code: "P2010",
        clientVersion: "6",
      }),
    );

    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("agents");
  });

  it("turns a schema parsed outside zParse into the same 400 with each field named", () => {
    const parsed = z.object({ pace: z.number() }).safeParse({ pace: "fast" });
    const { status, body } = answer(parsed.error as ZodError);

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.errors?.[0]?.path).toBe("pace");
  });

  it("hands an error to Express when the response has already started, because a second status cannot be sent", () => {
    const next = vi.fn();
    const res = { headersSent: true, status: vi.fn() } as unknown as Response;
    const error = new Error("late");

    errorHandler(error, {} as Request, res, next as NextFunction);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  TEST_ENV.isDeployed = false;
});
