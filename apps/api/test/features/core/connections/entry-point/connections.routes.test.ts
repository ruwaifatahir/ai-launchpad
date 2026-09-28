import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The domain is mocked and schema.ts is left real, so validation is exercised
// through the wire rather than around it. Neither the session middleware nor the
// ownership middleware is mocked: their rejections are the contract these routes
// publish, so the chain client underneath them is what stands in.
vi.mock("@/features/core/connections/domain/consent", () => ({
  readConsentText: vi.fn(),
  recordConsent: vi.fn(),
}));
vi.mock("@/features/core/connections/domain/handshake", () => ({
  startHandshake: vi.fn(),
}));
vi.mock("@/features/core/connections/domain/removal", () => ({
  disconnectAccount: vi.fn(),
}));
vi.mock("@/features/core/connections/domain/attestation", () => ({
  recordAttestation: vi.fn(),
}));
vi.mock("@/features/core/connections/domain/inspection", () => ({
  readConnection: vi.fn(),
}));
// Spread rather than replaced: the error handler reads this module for the error
// classes it maps, and a factory that dropped them would make every failure a 500.
vi.mock("@/lib/chain/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chain/client")>()),
  readTokenCreator: vi.fn(),
}));

import app from "@/app";
import { ApiError } from "@/shared";
import { ChainUnreachableError, readTokenCreator } from "@/lib/chain/client";
import { IndexerUnreachableError } from "@/lib/indexer/client";
import { mintCredential } from "@/lib/credential";
import {
  readConsentText,
  recordConsent,
} from "@/features/core/connections/domain/consent";
import { startHandshake } from "@/features/core/connections/domain/handshake";
import { disconnectAccount } from "@/features/core/connections/domain/removal";
import { recordAttestation } from "@/features/core/connections/domain/attestation";
import { readConnection } from "@/features/core/connections/domain/inspection";

const creator = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const stranger = "0x1111111111111111111111111111111111111111";
const token = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
const lowercased = "0xbcd4042de499d14e55001ccbb24a551f3b954096" as const;

const text = {
  token: lowercased,
  version: 1,
  title: "What your agent will do on your X account",
  sections: [{ heading: "What your agent does", points: ["It publishes posts."] }],
};

const recorded = {
  token: lowercased,
  version: 1,
  agreedAt: new Date("2026-05-01T09:00:00.000Z"),
};

const confirmedAt = new Date("2026-05-01T10:00:00.000Z");

const locked = ApiError.conflict(
  "This token has not graduated yet, so its agent cannot connect an X account.",
);

const read = async (address = token, wallet = creator) =>
  request(app)
    .get(`/api/v1/core/connections/${address}/consent`)
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`);

describe("GET /api/v1/core/connections/{token}/consent", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
    vi.mocked(readConsentText).mockResolvedValue(text);
  });

  it("answers 200 with the agreement in the shared envelope, so every success has one shape", async () => {
    const res = await read();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version).toBe(1);
  });

  it("serves the title and the ordered sections from the backend, so the panel renders what it is told and authors none of it", async () => {
    const res = await read();

    expect(Object.keys(res.body.data)).toEqual(["token", "version", "title", "sections"]);
    expect(res.body.data.sections[0].heading).toBe("What your agent does");
  });

  it("hands the domain the token lowercased, so a creator may send the address in either casing", async () => {
    await read(token);

    expect(readConsentText).toHaveBeenCalledWith({ token: lowercased });
  });

  it("answers 409 for a token that has not graduated, so a creator learns to wait rather than that something is broken", async () => {
    vi.mocked(readConsentText).mockRejectedValue(locked);

    const res = await read();

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("graduated");
  });

  it("answers 401 with no credential, and never reads the chain for a caller who has not signed in", async () => {
    const res = await request(app).get(`/api/v1/core/connections/${token}/consent`);

    expect(res.status).toBe(401);
    expect(readTokenCreator).not.toHaveBeenCalled();
    expect(readConsentText).not.toHaveBeenCalled();
  });

  it("answers 403 for a token the caller did not launch, because naming a wallet is not permission to act on a token", async () => {
    const res = await read(token, stranger);

    expect(res.status).toBe(403);
    expect(readConsentText).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the launchpad does not know, so a typo reads as missing rather than forbidden", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(null);

    const res = await read();

    expect(res.status).toBe(404);
    expect(readConsentText).not.toHaveBeenCalled();
  });

  it("answers 503 when the ownership read cannot reach the chain, never letting the request through on a failed check", async () => {
    vi.mocked(readTokenCreator).mockRejectedValue(
      new ChainUnreachableError(new Error("fetch failed")),
    );

    const res = await read();

    expect(res.status).toBe(503);
    expect(readConsentText).not.toHaveBeenCalled();
  });

  it("answers 503 when the graduation read cannot reach the indexer, so a dead indexer never lets an ungraduated token through", async () => {
    vi.mocked(readConsentText).mockRejectedValue(
      new IndexerUnreachableError(new Error("ECONNREFUSED")),
    );

    const res = await read();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
  });

  it("answers 400 for a path parameter that is not an address, and never calls the domain", async () => {
    const res = await read("not-an-address");

    expect(res.status).toBe(400);
    expect(readConsentText).not.toHaveBeenCalled();
  });
});

const agree = async (body: object, address = token, wallet = creator) =>
  request(app)
    .post(`/api/v1/core/connections/${address}/consent`)
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`)
    .send(body);

describe("POST /api/v1/core/connections/{token}/consent", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
    vi.mocked(recordConsent).mockResolvedValue(recorded);
  });

  it("answers 201 with what it recorded in the shared envelope, because agreeing creates a record rather than changing one", async () => {
    const res = await agree({ version: 1 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version).toBe(1);
  });

  it("returns the token, the version agreed to and the time, leaving the text to the read that owns it", async () => {
    const res = await agree({ version: 1 });

    expect(Object.keys(res.body.data)).toEqual(["token", "version", "agreedAt"]);
  });

  it("hands the domain the token lowercased, the version sent, and the wallet the credential names, so nobody can agree as another creator", async () => {
    await agree({ version: 1 }, token);

    expect(recordConsent).toHaveBeenCalledWith(
      { token: lowercased },
      { version: 1 },
      creator,
    );
  });

  it("answers 409 when the version is not the current one, so a creator with a stale panel open never records agreement to wording nobody is showing", async () => {
    vi.mocked(recordConsent).mockRejectedValue(
      ApiError.conflict(
        "This agreement has changed since you opened it. Read it again, then agree to the version you were shown.",
      ),
    );

    const res = await agree({ version: 1 });

    expect(res.status).toBe(409);
  });

  it("answers 409 for a token that has not graduated, so a creator learns to wait rather than that something is broken", async () => {
    vi.mocked(recordConsent).mockRejectedValue(locked);

    const res = await agree({ version: 1 });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("graduated");
  });

  it("answers 400 for a body that names no version, because an agreement that does not name its text records nothing", async () => {
    const res = await agree({});

    expect(res.status).toBe(400);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("answers 400 for a version that is not a whole number above zero, so no agreement is recorded against a text that cannot exist", async () => {
    expect((await agree({ version: 0 })).status).toBe(400);
    expect((await agree({ version: "1" })).status).toBe(400);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("answers 400 for an unknown field rather than dropping it, so a typo in a field name fails loudly", async () => {
    const res = await agree({ version: 1, agreed: true });

    expect(res.status).toBe(400);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("answers 401 with no credential, and never reads the chain for a caller who has not signed in", async () => {
    const res = await request(app)
      .post(`/api/v1/core/connections/${token}/consent`)
      .send({ version: 1 });

    expect(res.status).toBe(401);
    expect(readTokenCreator).not.toHaveBeenCalled();
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("answers 403 for a token the caller did not launch, so nobody agrees on another creator's behalf", async () => {
    const res = await agree({ version: 1 }, token, stranger);

    expect(res.status).toBe(403);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the launchpad does not know, so a typo reads as missing rather than forbidden", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(null);

    const res = await agree({ version: 1 });

    expect(res.status).toBe(404);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("answers 503 when the ownership read cannot reach the chain, never writing on a failed check", async () => {
    vi.mocked(readTokenCreator).mockRejectedValue(
      new ChainUnreachableError(new Error("fetch failed")),
    );

    const res = await agree({ version: 1 });

    expect(res.status).toBe(503);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("answers 503 when the graduation read cannot reach the indexer, so a dead indexer never records an agreement for an ungraduated token", async () => {
    vi.mocked(recordConsent).mockRejectedValue(
      new IndexerUnreachableError(new Error("ECONNREFUSED")),
    );

    const res = await agree({ version: 1 });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
  });

  it("answers 400 for a path parameter that is not an address, and never calls the domain", async () => {
    const res = await agree({ version: 1 }, "not-an-address");

    expect(res.status).toBe(400);
    expect(recordConsent).not.toHaveBeenCalled();
  });
});

const authorizeUrl = "https://x.com/i/oauth2/authorize?response_type=code&state=abc";

const start = async (address = token, wallet = creator) =>
  request(app)
    .post(`/api/v1/core/connections/${address}/authorization`)
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`);

describe("POST /api/v1/core/connections/{token}/authorization", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
    vi.mocked(startHandshake).mockResolvedValue({ url: authorizeUrl });
  });

  it("answers 201 with the X authorize URL in the shared envelope, because starting a handshake records one", async () => {
    const res = await start();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toBe(authorizeUrl);
  });

  it("never redirects, because a browser navigation carries no credential and this route is authenticated", async () => {
    const res = await start();

    expect(res.status).toBeLessThan(300);
    expect(res.headers.location).toBeUndefined();
  });

  it("returns the URL and nothing else, so neither the state nor the verifier leaves AI Launchpad", async () => {
    const res = await start();

    expect(Object.keys(res.body.data)).toEqual(["url"]);
  });

  it("hands the domain the token lowercased and the wallet the credential names, so nobody starts a handshake as another creator", async () => {
    await start(token);

    expect(startHandshake).toHaveBeenCalledWith({ token: lowercased }, creator);
  });

  it("answers 409 for a token that has not graduated, so a creator learns to wait rather than that something is broken", async () => {
    vi.mocked(startHandshake).mockRejectedValue(locked);

    const res = await start();

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("graduated");
  });

  it("answers 409 for a creator whose agreement is missing or out of date, because X says authorizing is not by itself consent to act", async () => {
    vi.mocked(startHandshake).mockRejectedValue(
      ApiError.conflict(
        "Agree to the list of automated actions your agent will take before connecting an X account.",
      ),
    );

    const res = await start();

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Agree to the list");
  });

  it("answers 401 with no credential, and never reads the chain for a caller who has not signed in", async () => {
    const res = await request(app).post(
      `/api/v1/core/connections/${token}/authorization`,
    );

    expect(res.status).toBe(401);
    expect(readTokenCreator).not.toHaveBeenCalled();
    expect(startHandshake).not.toHaveBeenCalled();
  });

  it("answers 403 for a token the caller did not launch, so nobody attaches an X account to another creator's token", async () => {
    const res = await start(token, stranger);

    expect(res.status).toBe(403);
    expect(startHandshake).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the launchpad does not know, so a typo reads as missing rather than forbidden", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(null);

    const res = await start();

    expect(res.status).toBe(404);
    expect(startHandshake).not.toHaveBeenCalled();
  });

  it("answers 503 when the ownership read cannot reach the chain, never starting a handshake on a failed check", async () => {
    vi.mocked(readTokenCreator).mockRejectedValue(
      new ChainUnreachableError(new Error("fetch failed")),
    );

    const res = await start();

    expect(res.status).toBe(503);
    expect(startHandshake).not.toHaveBeenCalled();
  });

  it("answers 503 when the graduation read cannot reach the indexer, so a dead indexer never lets an ungraduated token reach X", async () => {
    vi.mocked(startHandshake).mockRejectedValue(
      new IndexerUnreachableError(new Error("ECONNREFUSED")),
    );

    const res = await start();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
  });

  it("answers 400 for a path parameter that is not an address, and never calls the domain", async () => {
    const res = await start("not-an-address");

    expect(res.status).toBe(400);
    expect(startHandshake).not.toHaveBeenCalled();
  });
});

describe("the consent routes", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
  });

  it("offer no way to change or delete an agreement, because the record of what was authorized has to outlive the connection", async () => {
    const credential = `Bearer ${await mintCredential(creator)}`;
    const path = `/api/v1/core/connections/${token}/consent`;

    expect((await request(app).patch(path).set("Authorization", credential)).status).toBe(
      404,
    );
    expect((await request(app).put(path).set("Authorization", credential)).status).toBe(
      404,
    );
    expect(
      (await request(app).delete(path).set("Authorization", credential)).status,
    ).toBe(404);
  });
});

const disconnect = async (address = token, wallet = creator) =>
  request(app)
    .delete(`/api/v1/core/connections/${address}`)
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`);

describe("DELETE /api/v1/core/connections/{token}", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
    vi.mocked(disconnectAccount).mockResolvedValue({ token: lowercased });
  });

  it("answers 200 with the token it disconnected in the shared envelope, so every success has one shape", async () => {
    const res = await disconnect();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe(lowercased);
  });

  it("returns the token and nothing else, because the row it recorded is gone and there is no account left to name", async () => {
    const res = await disconnect();

    expect(Object.keys(res.body.data)).toEqual(["token"]);
  });

  it("hands the domain the token lowercased, so a creator may send the address in either casing", async () => {
    await disconnect(token);

    expect(disconnectAccount).toHaveBeenCalledWith({ token: lowercased });
  });

  it("answers 404 for a token with no X account connected, so disconnecting what is not connected is not a server error", async () => {
    vi.mocked(disconnectAccount).mockRejectedValue(
      ApiError.notFound("There is no X account connected to this token."),
    );

    const res = await disconnect();

    expect(res.status).toBe(404);
  });

  it("answers 401 with no credential, and never reads the chain for a caller who has not signed in", async () => {
    const res = await request(app).delete(`/api/v1/core/connections/${token}`);

    expect(res.status).toBe(401);
    expect(readTokenCreator).not.toHaveBeenCalled();
    expect(disconnectAccount).not.toHaveBeenCalled();
  });

  it("answers 403 for a token the caller did not launch, so nobody takes the agent off another creator's X account", async () => {
    const res = await disconnect(token, stranger);

    expect(res.status).toBe(403);
    expect(disconnectAccount).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the launchpad does not know, so a typo reads as missing rather than forbidden", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(null);

    const res = await disconnect();

    expect(res.status).toBe(404);
    expect(disconnectAccount).not.toHaveBeenCalled();
  });

  it("answers 503 when the ownership read cannot reach the chain, never revoking or deleting on a failed check", async () => {
    vi.mocked(readTokenCreator).mockRejectedValue(
      new ChainUnreachableError(new Error("fetch failed")),
    );

    const res = await disconnect();

    expect(res.status).toBe(503);
    expect(disconnectAccount).not.toHaveBeenCalled();
  });

  it("answers 400 for a path parameter that is not an address, and never calls the domain", async () => {
    const res = await disconnect("not-an-address");

    expect(res.status).toBe(400);
    expect(disconnectAccount).not.toHaveBeenCalled();
  });
});

const attest = async (address = token, wallet = creator, body?: object) => {
  const call = request(app)
    .put(`/api/v1/core/connections/${address}/attestation`)
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`);

  return body ? call.send(body) : call;
};

describe("PUT /api/v1/core/connections/{token}/attestation", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
    vi.mocked(recordAttestation).mockResolvedValue({
      token: lowercased,
      confirmedAt,
    });
  });

  it("answers 200 with the time recorded in the shared envelope, because confirming finishes a connection rather than creating one", async () => {
    const res = await attest();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.confirmedAt).toBe(confirmedAt.toISOString());
  });

  it("returns the token and the time and no credential, as every response in this feature does", async () => {
    const res = await attest();

    expect(Object.keys(res.body.data)).toEqual(["token", "confirmedAt"]);
  });

  it("takes both steps in one call carrying no body, so finishing is one action rather than two", async () => {
    await attest();

    expect(recordAttestation).toHaveBeenCalledWith({ token: lowercased });
  });

  it("answers 400 for a body claiming either step on its own, because confirming is one action that carries nothing", async () => {
    const res = await attest(token, creator, { automatedLabel: true });

    expect(res.status).toBe(400);
    expect(recordAttestation).not.toHaveBeenCalled();
  });

  it("answers 409 for a token that has not graduated, so a creator learns to wait rather than that something is broken", async () => {
    vi.mocked(recordAttestation).mockRejectedValue(locked);

    const res = await attest();

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("graduated");
  });

  it("answers 409 for a token with no X account connected, because there is nothing to confirm about an account that is not there", async () => {
    vi.mocked(recordAttestation).mockRejectedValue(
      ApiError.conflict(
        "Connect an X account before confirming the automated label and the link in the bio.",
      ),
    );

    const res = await attest();

    expect(res.status).toBe(409);
  });

  it("answers 401 with no credential, and never reads the chain for a caller who has not signed in", async () => {
    const res = await request(app).put(`/api/v1/core/connections/${token}/attestation`);

    expect(res.status).toBe(401);
    expect(readTokenCreator).not.toHaveBeenCalled();
    expect(recordAttestation).not.toHaveBeenCalled();
  });

  it("answers 403 for a token the caller did not launch, so nobody vouches for another creator's X account", async () => {
    const res = await attest(token, stranger);

    expect(res.status).toBe(403);
    expect(recordAttestation).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the launchpad does not know, so a typo reads as missing rather than forbidden", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(null);

    const res = await attest();

    expect(res.status).toBe(404);
    expect(recordAttestation).not.toHaveBeenCalled();
  });

  it("answers 503 when the chain cannot be read, never recording a confirmation on a failed check", async () => {
    vi.mocked(readTokenCreator).mockRejectedValue(
      new ChainUnreachableError(new Error("fetch failed")),
    );

    const res = await attest();

    expect(res.status).toBe(503);
    expect(recordAttestation).not.toHaveBeenCalled();
  });

  it("answers 400 for a path parameter that is not an address, and never calls the domain", async () => {
    const res = await attest("not-an-address");

    expect(res.status).toBe(400);
    expect(recordAttestation).not.toHaveBeenCalled();
  });
});

const connection = {
  token: lowercased,
  xUsername: "agentofthings",
  confirmedAt,
  outstandingGate: null,
  disconnected: false,
};

const inspect = async (address = token, wallet = creator) =>
  request(app)
    .get(`/api/v1/core/connections/${address}`)
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`);

describe("GET /api/v1/core/connections/{token}", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
    vi.mocked(readConnection).mockResolvedValue(connection);
  });

  it("answers 200 with the connection in the shared envelope, so every success has one shape", async () => {
    const res = await inspect();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.xUsername).toBe("agentofthings");
  });

  it("carries neither credential, because the two X credentials never leave AI Launchpad in any response", async () => {
    const res = await inspect();

    expect(Object.keys(res.body.data)).toEqual([
      "token",
      "xUsername",
      "confirmedAt",
      "outstandingGate",
      "disconnected",
    ]);
  });

  it("names the outstanding gate and whether a connection ended, which is what the panel shows instead of leaving a creator to guess why their agent is silent", async () => {
    vi.mocked(readConnection).mockResolvedValue({
      ...connection,
      xUsername: null,
      confirmedAt: null,
      outstandingGate: "authorization",
      disconnected: true,
    });

    const res = await inspect();

    expect(res.body.data.outstandingGate).toBe("authorization");
    expect(res.body.data.disconnected).toBe(true);
  });

  it("hands the domain the token lowercased, so a creator may send the address in either casing", async () => {
    await inspect(token);

    expect(readConnection).toHaveBeenCalledWith({ token: lowercased });
  });

  it("answers 409 for a token that has not graduated, because there is no connection to report before then", async () => {
    vi.mocked(readConnection).mockRejectedValue(locked);

    const res = await inspect();

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("graduated");
  });

  it("answers 401 with no credential, and never reads the chain for a caller who has not signed in", async () => {
    const res = await request(app).get(`/api/v1/core/connections/${token}`);

    expect(res.status).toBe(401);
    expect(readTokenCreator).not.toHaveBeenCalled();
    expect(readConnection).not.toHaveBeenCalled();
  });

  it("answers 403 for a token the caller did not launch, so nobody reads which X account another creator connected", async () => {
    const res = await inspect(token, stranger);

    expect(res.status).toBe(403);
    expect(readConnection).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the launchpad does not know, so a typo reads as missing rather than forbidden", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(null);

    const res = await inspect();

    expect(res.status).toBe(404);
    expect(readConnection).not.toHaveBeenCalled();
  });

  it("answers 503 when the chain cannot be read, never answering on a failed check", async () => {
    vi.mocked(readTokenCreator).mockRejectedValue(
      new ChainUnreachableError(new Error("fetch failed")),
    );

    const res = await inspect();

    expect(res.status).toBe(503);
    expect(readConnection).not.toHaveBeenCalled();
  });

  it("answers 400 for a path parameter that is not an address, and never calls the domain", async () => {
    const res = await inspect("not-an-address");

    expect(res.status).toBe(400);
    expect(readConnection).not.toHaveBeenCalled();
  });

  it("leaves the callback reachable at its own path, because X is registered against a URL this route's own parameter would otherwise swallow", async () => {
    const res = await request(app).get("/api/v1/core/connections/callback");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/connect/x?status=failure");
    expect(readConnection).not.toHaveBeenCalled();
  });
});
