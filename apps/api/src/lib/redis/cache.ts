import { logger } from "@/lib/logger";
import { cacheRedis } from "@/lib/redis/client";

// Reads that are already under way, by key. Requests that arrive together on an
// empty entry wait on the one read rather than each starting their own, so a burst
// of visitors costs one read and not one each. It is per process, and Redis is what
// shares the answer between processes.
const inFlight = new Map<string, Promise<unknown>>();

const warn = (message: string, key: string, error: unknown) =>
  logger.warn(message, {
    key,
    error: error instanceof Error ? error.message : String(error),
  });

// cacheRedis refuses a command while disconnected and times out a slow one, so a read
// never waits on an absent Redis. src/lib/redis/client.ts holds both settings.
const readCache = async (key: string): Promise<{ value: unknown } | null> => {
  try {
    const hit = await cacheRedis.get(key);
    return typeof hit === "string" ? { value: JSON.parse(hit) } : null;
  } catch (error) {
    warn("cache read failed", key, error);
    return null;
  }
};

// Not awaited: the caller already has its answer and gains nothing by waiting on the
// write.
const writeCache = (key: string, ttlSeconds: number, value: unknown) => {
  cacheRedis
    .setex(key, ttlSeconds, JSON.stringify(value))
    .catch((error: unknown) => warn("cache write failed", key, error));
};

// Answers from Redis while the entry lives, and otherwise runs load and holds what it
// returns for ttlSeconds. A load that throws holds nothing, so a failure is never
// served again from the cache. The value travels as JSON, so load must return one.
//
// ttlSeconds may be worked out from the value, for a caller that holds one answer
// longer than another, such as a missing rate for less time than a rate.
//
// Redis failing costs only the saving: the read falls through to load, and a failed
// write is logged and the value still returned.
export const cached = async <T>(
  key: string,
  ttlSeconds: number | ((value: T) => number),
  load: () => Promise<T>,
): Promise<T> => {
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const loading = (async () => {
    const hit = await readCache(key);
    if (hit) return hit.value as T;

    const value = await load();
    writeCache(
      key,
      typeof ttlSeconds === "number" ? ttlSeconds : ttlSeconds(value),
      value,
    );
    return value;
  })();

  inFlight.set(key, loading);

  try {
    return await loading;
  } finally {
    inFlight.delete(key);
  }
};
