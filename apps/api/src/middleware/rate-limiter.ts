import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { RedisStore } from "rate-limit-redis";
import { getContext } from "@/lib/context";
import { redis } from "@/lib/redis/client";

const redisStore = (prefix: string) =>
  new RedisStore({
    sendCommand: async (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<number>,
    prefix,
  });

// Keyed by the IP alone, even behind a session, for a budget a caller cannot widen
// by signing in with more wallets. ipKeyGenerator groups an IPv6 address by its
// subnet, so one host cannot rotate through the addresses it holds.
export const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");

// Keyed by the session wallet, so two creators sharing one office IP get a budget
// each. The IP is the fallback for a route that runs before the session middleware,
// which is the only thing that sets req.session.
export const sessionKey = (req: Request) => req.session?.wallet ?? ipKey(req);

// Parameterised, so a route that needs a tighter budget than the global one builds
// its own and this file holds no feature-specific number. Keyed by sessionKey unless
// the route names another key.
export const makeLimiter = (options: {
  windowMs: number;
  max: number;
  prefix: string;
  key?: (req: Request) => string;
  passOnStoreError?: boolean;
}) =>
  rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    passOnStoreError: options.passOnStoreError ?? false,
    standardHeaders: true,
    legacyHeaders: false,
    store: redisStore(options.prefix),
    keyGenerator: options.key ?? sessionKey,
    // The same body every other failure carries, because a client reading the code
    // should not need to know which layer refused it. express-rate-limit has
    // already set Retry-After and the RateLimit headers by the time this runs.
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        statusCode: 429,
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests",
        ...(getContext()?.requestId && { requestId: getContext()?.requestId }),
      });
    },
  });

export const limiter = makeLimiter({ windowMs: 60 * 1000, max: 100, prefix: "rl:" });
