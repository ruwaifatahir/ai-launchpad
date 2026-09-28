import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.stubGlobal("fetch", fetchMock);

import { XGrantGoneError, XMisconfiguredError } from "@/lib/x/oauth";
import {
  XCredentialDeadError,
  XPostRefusedError,
  XRateLimitedError,
  createPost,
} from "@/lib/x/posting";
import { XUnreachableError } from "@/lib/x/transport";

const published = { data: { id: "1899887766554433221", text: "the post" } };

const answered = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const sent = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

  return {
    url,
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  };
};

const publishing = () =>
  createPost({ accessCredential: "access-credential", text: "the post" });

const failing = (status: number) => {
  fetchMock.mockResolvedValue(answered(status, { title: "refused" }));

  return publishing();
};

describe("createPost", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(answered(201, published));
  });

  it("publishes with the creator's own credential, because X accepts no app only credential at this endpoint at all", async () => {
    await publishing();

    const { url, method, headers } = sent();

    expect(url).toBe("https://api.x.com/2/tweets");
    expect(method).toBe("POST");
    expect(headers.Authorization).toBe("Bearer access-credential");
  });

  it("sends the text and nothing beside it, because plain text is the one thing the consent covers and a link would cost thirteen times as much", async () => {
    await publishing();

    const { headers, body } = sent();

    expect(headers["Content-Type"]).toBe("application/json");
    expect(body).toEqual({ text: "the post" });
  });

  it("hands back the identifier X assigned, which is the only way a published post is found again", async () => {
    await expect(publishing()).resolves.toBe("1899887766554433221");
  });

  it("refuses an answer carrying no identifier, so a post nobody can point at is never recorded as published", async () => {
    fetchMock.mockResolvedValue(answered(201, { data: { text: "the post" } }));

    await expect(publishing()).rejects.toThrow();
  });
});

describe("the failures this module names", () => {
  it("reports the creator's access credential as dead on a 401 and never as AI Launchpad's own credentials being wrong, which is the whole reason this mapping is not the OAuth one", async () => {
    const failure = await failing(401).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(XCredentialDeadError);
    expect(failure).not.toBeInstanceOf(XMisconfiguredError);
  });

  it("reports a policy refusal on a 403, separately from a dead credential, because one is answered by reconnecting and the other must never be tried again", async () => {
    const failure = await failing(403).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(XPostRefusedError);
    expect(failure).not.toBeInstanceOf(XCredentialDeadError);
  });

  it("reports a rate limit on a 429, which the OAuth mapping leaves unnamed, so that a caller can stand down rather than add pressure to a limit already reached", async () => {
    await expect(failing(429)).rejects.toBeInstanceOf(XRateLimitedError);
  });

  it("reports X as unreachable on a 5xx, which is the one failure the posting call and the OAuth calls raise alike", async () => {
    fetchMock.mockResolvedValue(answered(503, "upstream unavailable"));

    await expect(publishing()).rejects.toBeInstanceOf(XUnreachableError);
  });

  it("reports X as unreachable when the connection fails, which is the same outage arriving without a status", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(publishing()).rejects.toBeInstanceOf(XUnreachableError);
  });

  it("never reads a 400 as a gone grant, because that answer deletes a connection and here it means the draft was malformed rather than the creator gone", async () => {
    const failure = await failing(400).catch((error: unknown) => error);

    expect((failure as Error).name).toBe("Error");
    expect(failure).not.toBeInstanceOf(XGrantGoneError);
  });

  it("keeps what X actually said as its cause, because the body is the only evidence of which rule a refused post broke", async () => {
    const failure = await failing(403).catch((error: unknown) => error);

    expect((failure as XPostRefusedError).cause).toContain("refused");
  });

  it("tells a caller nothing about HTTP, because what a status costs a creator is the caller's decision and not this module's", async () => {
    const failure = await failing(403).catch((error: unknown) => error);

    expect((failure as XPostRefusedError).message).not.toMatch(/\b[45]\d\d\b/);
  });
});
