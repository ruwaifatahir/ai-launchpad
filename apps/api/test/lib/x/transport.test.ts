import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.stubGlobal("fetch", fetchMock);

import { XUnreachableError, send } from "@/lib/x/transport";

const PROBE_URL = "https://api.x.com/2/probe";

// Stands in for the mapping each calling module brings. What it names does not
// matter here: that the transport asks it at all, and when it does not, is the
// whole of what this file defends.
const named = vi.fn((status: number, cause: string): never => {
  throw new Error(`named ${status}: ${cause}`);
});

const answered = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const probe = () => send(PROBE_URL, {}, named);

const sent = () => (fetchMock.mock.calls[0] as [string, RequestInit])[1];

describe("send", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(answered(200, { ok: true }));
  });

  it("carries a deadline on every request, because a hung connection would otherwise hold a post open until the caller gave up and the outage below would never be reached", async () => {
    await probe();

    expect(sent().signal).toBeInstanceOf(AbortSignal);
  });

  it("hands the body back unread, because what a successful answer means is the calling module's to parse and not this one's", async () => {
    await expect(probe()).resolves.toBe(JSON.stringify({ ok: true }));
  });

  it("reports X as unreachable when the connection fails, which is an outage arriving without a status", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(probe()).rejects.toBeInstanceOf(XUnreachableError);
  });

  it("reports X as unreachable when X never answers at all, so a hung connection is an outage rather than a request held open forever", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("The operation was aborted due to timeout", "TimeoutError"),
    );

    await expect(probe()).rejects.toBeInstanceOf(XUnreachableError);
  });

  it("names a 5xx as unreachable itself and never asks the calling module, because a server fault means the same thing at every X endpoint and is the one failure both mappings share", async () => {
    fetchMock.mockResolvedValue(answered(503, "upstream unavailable"));

    await expect(probe()).rejects.toBeInstanceOf(XUnreachableError);
    expect(named).not.toHaveBeenCalled();
  });

  it("hands every other status to the mapping the calling module brought, which is what stops one classifier reading 401 the same way at the token endpoint and the post endpoint", async () => {
    fetchMock.mockResolvedValue(answered(401, { title: "Unauthorized" }));

    await expect(probe()).rejects.toThrow("named 401");
    expect(named).toHaveBeenCalledTimes(1);
  });

  it("keeps who answered, with what, and what they said, because X publishes no error shape and the body is the only evidence an operator gets", async () => {
    fetchMock.mockResolvedValue(answered(503, "upstream unavailable"));

    const failure = await probe().catch((error: unknown) => error);

    expect((failure as XUnreachableError).cause).toBe(
      `${PROBE_URL} answered 503: upstream unavailable`,
    );
  });

  it("truncates what it keeps, because an outage is answered by whatever sits in front of X rather than by X and that can be a whole page of HTML", async () => {
    fetchMock.mockResolvedValue(answered(503, "x".repeat(5000)));

    const failure = await probe().catch((error: unknown) => error);

    expect(String((failure as XUnreachableError).cause)).toHaveLength(
      `${PROBE_URL} answered 503: `.length + 200,
    );
  });

  it("tells a caller nothing about HTTP, because what a status means for a creator is the caller's decision and not this module's", async () => {
    fetchMock.mockResolvedValue(answered(503, "upstream unavailable"));

    const failure = await probe().catch((error: unknown) => error);

    expect((failure as XUnreachableError).message).not.toMatch(/\b[45]\d\d\b/);
  });
});
