import { describe, expect, it, vi } from "vitest";

// makeLimiter is replaced with one that records what it was built with. It records into
// a plain array, because clearMocks wipes a mock's calls before each test and the
// limiters are built once, at import.
const { built, ipKey } = vi.hoisted(() => ({
  built: [] as Record<string, unknown>[],
  ipKey: () => "ip",
}));

vi.mock("@/middleware/rate-limiter", () => ({
  ipKey,
  makeLimiter: (options: Record<string, unknown>) => {
    built.push(options);
    return () => {};
  },
}));

import "@/features/core/logos/limiter";

const byPrefix = (prefix: string) => built.find((options) => options.prefix === prefix);

describe("the logo rate limits", () => {
  it("allows a wallet ten uploads an hour, keyed as every creator route is", () => {
    expect(byPrefix("rl:logos:")).toMatchObject({ windowMs: 3_600_000, max: 10 });
    expect(byPrefix("rl:logos:")?.key).toBeUndefined();
  });

  it("allows an IP thirty uploads an hour, whatever wallets sign in behind it", () => {
    expect(byPrefix("rl:logos-ip:")).toMatchObject({
      windowMs: 3_600_000,
      max: 30,
      key: ipKey,
    });
  });
});
