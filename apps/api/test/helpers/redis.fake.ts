import { vi } from "vitest";
import { cacheRedis } from "@/lib/redis/client";

// The cache's Redis client is mocked in test/setup.ts. This stands a store behind the
// mock that keeps an expiry against Date.now, so a test can move the clock past it.
// Call it in a beforeEach: each call starts an empty store, so no response cached by
// one test reaches the next.
export const useFakeRedis = () => {
  const store = new Map<string, { value: string; expiresAt: number }>();

  vi.mocked(cacheRedis.get).mockImplementation(async (key) => {
    const entry = store.get(String(key));
    return entry && entry.expiresAt > Date.now() ? entry.value : null;
  });
  vi.mocked(cacheRedis.setex).mockImplementation(async (key, seconds, value) => {
    store.set(String(key), {
      value: String(value),
      expiresAt: Date.now() + Number(seconds) * 1000,
    });
    return "OK";
  });
};
