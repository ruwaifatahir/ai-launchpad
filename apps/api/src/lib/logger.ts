import winston from "winston";
import { env } from "@/config/env";
import { getContext } from "@/lib/context";

// Merge the per-request spine (requestId, route, method) into every line, so any
// log anywhere in a request is already correlated.
const withContext = winston.format((info) => {
  const ctx = getContext();
  if (ctx) {
    info.requestId = ctx.requestId;
    info.route = ctx.route;
    info.method = ctx.method;
  }
  return info;
});

// Known secret keys never ship, even if something logs them by accident.
// Shallow by design: log flat objects. Extend the set as you add credentials.
//
// Named for the bearer artefacts themselves rather than for "token", which in this
// domain is the chain address an agent belongs to and is public. Guarding that word
// blanked the one field naming which agent a poster line was about.
const SECRET_KEYS = new Set([
  "password",
  "credential",
  "accessCredential",
  "refreshCredential",
  "authorization",
  "apiKey",
  "secret",
]);

const redact = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (SECRET_KEYS.has(key)) info[key] = "[REDACTED]";
  }
  return info;
});

// A deployed process emits JSON, which is what a log shipper wants. A local one
// prints readable colorized lines. Context, redaction, the timestamp and the stack of
// a logged Error run for both.
const format = env.isDeployed
  ? winston.format.json()
  : winston.format.combine(winston.format.colorize(), winston.format.simple());

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    withContext(),
    redact(),
    format,
  ),
  transports: [new winston.transports.Console()],
});
