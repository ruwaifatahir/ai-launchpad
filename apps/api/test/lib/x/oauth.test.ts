import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.stubGlobal("fetch", fetchMock);

import {
  XGrantGoneError,
  XMisconfiguredError,
  authorizeUrl,
  exchangeCode,
  readAccount,
  renewGrant,
  revokeGrant,
} from "@/lib/x/oauth";
import { XUnreachableError } from "@/lib/x/transport";
import { TEST_ENV } from "@test/helpers/env.mock";

const grant = {
  access_token: "access-credential",
  refresh_token: "refresh-credential",
  expires_in: 7200,
};

const account = { data: { id: "1799887766554433221", username: "dsafsdafsdbj" } };

const answered = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const sent = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

  return {
    url,
    headers: init.headers as Record<string, string>,
    fields: new URLSearchParams(init.body as URLSearchParams),
  };
};

// Every call in this module goes out through one transport and comes back through
// one classifier, so each named failure is proved once against the call that
// raises it in production rather than four times against four calls.
const failing = (status: number) => {
  fetchMock.mockResolvedValue(answered(status, { error: "invalid_request" }));

  return renewGrant("spent-refresh-credential");
};

describe("authorizeUrl", () => {
  it("asks X for the four scopes the two calls AI Launchpad makes plus renewal need and not one more, so nothing an agent could like, follow or quote with is ever granted", () => {
    const url = new URL(authorizeUrl({ state: "state-1", verifier: "verifier-1" }));
    const scopes = url.searchParams.get("scope") ?? "";

    expect(scopes.split(" ").sort()).toEqual([
      "offline.access",
      "tweet.read",
      "tweet.write",
      "users.read",
    ]);
    expect(scopes).not.toMatch(/like|follow|bookmark|block|mute/);
  });

  it("sends the callback URL exactly as it was configured, because X matches it character for character against one of ten registered URLs and a URL AI Launchpad assembles can silently stop matching", () => {
    const url = new URL(authorizeUrl({ state: "state-3", verifier: "verifier-3" }));

    expect(url.searchParams.get("redirect_uri")).toBe(TEST_ENV.X_CALLBACK_URL);
  });

  it("derives the PKCE challenge from the verifier the caller stores, so the secret kept in Redis and the challenge shown to X can never drift apart", () => {
    const verifier = "verifier-4";
    const url = new URL(authorizeUrl({ state: "state-4", verifier }));

    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("carries the state X will hand back, which is the only thing vouching for the callback later", () => {
    const url = new URL(authorizeUrl({ state: "state-5", verifier: "verifier-5" }));

    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(url.searchParams.get("state")).toBe("state-5");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(TEST_ENV.X_CLIENT_ID);
  });

  it("opens no connection, because the authorize step is a URL for the creator's browser rather than a call AI Launchpad makes", () => {
    authorizeUrl({ state: "state-6", verifier: "verifier-6" });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("exchangeCode", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(answered(200, grant));
  });

  it("exchanges the code with the verifier and the same callback URL the authorize step sent, both of which X checks", async () => {
    await exchangeCode({ code: "code-1", verifier: "verifier-1" });

    const { url, fields } = sent();

    expect(url).toBe("https://api.x.com/2/oauth2/token");
    expect(fields.get("grant_type")).toBe("authorization_code");
    expect(fields.get("code")).toBe("code-1");
    expect(fields.get("code_verifier")).toBe("verifier-1");
    expect(fields.get("redirect_uri")).toBe(TEST_ENV.X_CALLBACK_URL);
  });

  it("proves AI Launchpad is the app it says it is in the header rather than the form, which is how X authenticates a confidential client", async () => {
    await exchangeCode({ code: "code-2", verifier: "verifier-2" });

    const { headers, fields } = sent();
    const credentials = `${TEST_ENV.X_CLIENT_ID}:${TEST_ENV.X_CLIENT_SECRET}`;

    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from(credentials).toString("base64")}`,
    );
    expect(fields.get("client_secret")).toBeNull();
  });

  it("hands back both credentials and the moment the access one dies, so a caller can renew ahead of a post rather than after a failure", async () => {
    const before = Date.now();

    const renewed = await exchangeCode({ code: "code-3", verifier: "verifier-3" });

    expect(renewed.accessCredential).toBe("access-credential");
    expect(renewed.refreshCredential).toBe("refresh-credential");
    expect(renewed.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7_200_000);
    expect(renewed.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 7_200_000);
  });
});

describe("renewGrant", () => {
  it("spends the refresh credential for a new pair, because X rotates both and gives no overlap", async () => {
    fetchMock.mockResolvedValue(
      answered(200, { ...grant, access_token: "access-2", refresh_token: "refresh-2" }),
    );

    const renewed = await renewGrant("refresh-credential");

    const { url, fields } = sent();

    expect(url).toBe("https://api.x.com/2/oauth2/token");
    expect(fields.get("grant_type")).toBe("refresh_token");
    expect(fields.get("refresh_token")).toBe("refresh-credential");
    expect(renewed.accessCredential).toBe("access-2");
    expect(renewed.refreshCredential).toBe("refresh-2");
  });
});

describe("revokeGrant", () => {
  it("sends X the refresh credential and nothing beside it, which is all X documents a confidential client sending to this endpoint", async () => {
    fetchMock.mockResolvedValue(answered(200, {}));

    await revokeGrant("refresh-credential");

    const { url, fields } = sent();

    expect(url).toBe("https://api.x.com/2/oauth2/revoke");
    expect(fields.get("token")).toBe("refresh-credential");
    expect([...fields.keys()]).toEqual(["token"]);
  });

  it("reads nothing back, because X documents no success shape for this endpoint and a disconnect must not depend on an answer nobody can check", async () => {
    fetchMock.mockResolvedValue(answered(200, "revoked: maybe"));

    await expect(revokeGrant("refresh-credential")).resolves.toBeUndefined();
  });
});

describe("readAccount", () => {
  it("reads the account with the creator's own credential, because every app only call X offers has answered 401", async () => {
    fetchMock.mockResolvedValue(answered(200, account));

    await readAccount("access-credential");

    const { url, headers } = sent();

    expect(url).toBe("https://api.x.com/2/users/me");
    expect(headers.Authorization).toBe("Bearer access-credential");
  });

  it("names the permanent identifier and the handle separately, because a creator changes a handle at will and the identifier is what one X account to one token is enforced on", async () => {
    fetchMock.mockResolvedValue(answered(200, account));

    await expect(readAccount("access-credential")).resolves.toEqual({
      id: "1799887766554433221",
      handle: "dsafsdafsdbj",
    });
  });
});

describe("the failures this module names", () => {
  it("reports the grant as gone on a 400, which is the only answer our live test ever saw for a spent refresh credential", async () => {
    await expect(failing(400)).rejects.toBeInstanceOf(XGrantGoneError);
  });

  it("reports AI Launchpad's own credentials as wrong on a 401 and never as a gone grant, which is the single branch standing between a mistyped client secret in a deploy and every connection in the database being deleted inside an hour", async () => {
    const failure = await failing(401).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(XMisconfiguredError);
    expect(failure).not.toBeInstanceOf(XGrantGoneError);
  });

  it("leaves a status it does not recognise alone, so a rate limit the posting module names is never dressed up here as an outage or as a grant worth deleting", async () => {
    const failure = await failing(429).catch((error: unknown) => error);

    expect((failure as Error).name).toBe("Error");
    expect(failure).not.toBeInstanceOf(XUnreachableError);
    expect(failure).not.toBeInstanceOf(XGrantGoneError);
    expect(failure).not.toBeInstanceOf(XMisconfiguredError);
  });

  it("names the same failures for every call, because one classifier serves the exchange, the renewal, the revoke and the account read alike", async () => {
    fetchMock.mockResolvedValue(answered(400, { error: "invalid_request" }));
    await expect(revokeGrant("refresh-credential")).rejects.toBeInstanceOf(
      XGrantGoneError,
    );

    fetchMock.mockResolvedValue(answered(401, { error: "unauthorized" }));
    await expect(readAccount("access-credential")).rejects.toBeInstanceOf(
      XMisconfiguredError,
    );

    fetchMock.mockResolvedValue(answered(503, "upstream unavailable"));
    await expect(
      exchangeCode({ code: "code", verifier: "verifier" }),
    ).rejects.toBeInstanceOf(XUnreachableError);
  });

  it("keeps what X actually said as its cause, because X publishes no error shape and the body is the only evidence an operator gets", async () => {
    const failure = await failing(400).catch((error: unknown) => error);

    expect((failure as XGrantGoneError).cause).toContain("invalid_request");
  });

  it("tells a caller nothing about HTTP, because what a status means for a creator is the caller's decision and not this module's", async () => {
    const failure = await failing(400).catch((error: unknown) => error);

    expect((failure as XGrantGoneError).message).not.toMatch(/\b[45]\d\d\b/);
  });

  it("refuses an answer that is not the pair X promises, so a malformed body is never stored as a credential", async () => {
    fetchMock.mockResolvedValue(answered(200, { access_token: "access-only" }));

    await expect(renewGrant("refresh-credential")).rejects.toThrow();
  });
});
