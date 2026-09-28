import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { als } from "@/lib/context";
import { logger } from "@/lib/logger";

// Opens the per-request context and emits one access-log line per request.
// Mounted first (see app.ts) so even a rejected request carries a requestId.
// The client may supply x-request-id for correlation only; it is never trusted
// for anything security-sensitive. It is echoed into every log line and back in a
// response header, so anything but a short run of safe characters is replaced
// rather than let a caller write newlines or a megabyte into the logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const requestContext: RequestHandler = (req, res, next) => {
  const headerId = req.headers["x-request-id"];
  const requestId =
    typeof headerId === "string" && SAFE_REQUEST_ID.test(headerId)
      ? headerId
      : randomUUID();
  res.setHeader("x-request-id", requestId);

  const start = Date.now();

  als.run({ requestId, method: req.method, route: req.originalUrl }, () => {
    res.on("finish", () => {
      logger.info("request", { status: res.statusCode, durationMs: Date.now() - start });
    });
    next();
  });
};
