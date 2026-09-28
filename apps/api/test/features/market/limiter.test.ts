import { describe, expect, it, vi } from "vitest";

// makeLimiter is replaced with one that records what it was built with. It records into
// a plain array, because clearMocks wipes a mock's calls before each test and the
// limiter is built once, at import.
const { built } = vi.hoisted(() => ({ built: [] as Record<string, unknown>[] }));

vi.mock("@/middleware/rate-limiter", () => ({
  makeLimiter: (options: Record<string, unknown>) => {
    built.push(options);
    return () => {};
  },
}));

import "@/features/market/limiter";

describe("the market rate limit", () => {
  it("counts under its own prefix, so polling a token page never spends a creator's budget", () => {
    expect(built[0]?.prefix).toBe("rl:market:");
  });

  it("allows 300 a minute, room for eight token pages polling behind one shared IP", () => {
    expect(built[0]).toMatchObject({ windowMs: 60_000, max: 300 });
  });
});
