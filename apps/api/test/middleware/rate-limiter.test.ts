import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";

const { ipKey, sessionKey } = await vi.importActual<
  typeof import("@/middleware/rate-limiter")
>("@/middleware/rate-limiter");

const asRequest = (wallet: string | undefined, ip: string) =>
  ({ ...(wallet ? { session: { wallet } } : {}), ip }) as unknown as Request;

describe("sessionKey", () => {
  it("gives two wallets behind one IP a budget each, so one busy creator cannot rate limit another", () => {
    const first = sessionKey(
      asRequest("0xA0Cf798816D4b9b9866b5330EEa46a18382f251e", "1.2.3.4"),
    );
    const second = sessionKey(
      asRequest("0x1111111111111111111111111111111111111111", "1.2.3.4"),
    );

    expect(first).not.toBe(second);
  });

  it("keys by the session wallet rather than the IP, so a creator moving networks keeps one budget", () => {
    const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";

    expect(sessionKey(asRequest(wallet, "1.2.3.4"))).toBe(
      sessionKey(asRequest(wallet, "5.6.7.8")),
    );
  });

  it("falls back to the IP when no session is set, which is every route mounted before the session middleware", () => {
    expect(sessionKey(asRequest(undefined, "1.2.3.4"))).not.toBe(
      sessionKey(asRequest(undefined, "5.6.7.8")),
    );
  });

  it("still produces a key when express reports no IP at all, so a request is never unkeyed", () => {
    expect(sessionKey({} as Request)).toBeTruthy();
  });
});

describe("ipKey", () => {
  it("keys by the IP even behind a session, so signing in with more wallets never widens the budget", () => {
    expect(
      ipKey(asRequest("0xA0Cf798816D4b9b9866b5330EEa46a18382f251e", "1.2.3.4")),
    ).toBe(ipKey(asRequest("0x1111111111111111111111111111111111111111", "1.2.3.4")));
  });

  it("gives two IPs a budget each", () => {
    expect(ipKey(asRequest(undefined, "1.2.3.4"))).not.toBe(
      ipKey(asRequest(undefined, "5.6.7.8")),
    );
  });

  it("groups an IPv6 host's addresses, so one host cannot rotate through its subnet", () => {
    expect(ipKey(asRequest(undefined, "2001:db8:1:1::1"))).toBe(
      ipKey(asRequest(undefined, "2001:db8:1:1::2")),
    );
  });
});
