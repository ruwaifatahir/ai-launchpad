import Redis from "ioredis";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

// Single shared connection. maxRetriesPerRequest: null is required by BullMQ.
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// The response cache's own connection, because the shared one above is wrong for it.
// That one queues every command for as long as Redis is away, so a cache in front of
// polled routes would pile up a GET and a SETEX per request for the whole outage and
// replay them all on reconnect. This one refuses a command at once while disconnected
// and fails one that takes longer than a healthy read ever does, so an absent Redis
// costs the cache its saving and nothing else.
export const cacheRedis = new Redis(env.REDIS_URL, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  commandTimeout: 250,
});

// Without a listener ioredis prints every failed reconnect as an unhandled error event,
// outside the structured log. Reconnects back off to one every two seconds, so this
// stays a trickle for as long as Redis is away.
cacheRedis.on("error", (error) => {
  logger.warn("the cache's Redis connection failed", { error: error.message });
});
