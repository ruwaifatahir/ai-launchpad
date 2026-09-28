import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The domain is mocked and schema.ts is left real, so validation is exercised
// through the wire rather than around it. Neither the session middleware nor the
// ownership middleware is mocked: their rejections are the contract this route
// publishes, so the chain client underneath them is what stands in.
vi.mock("@/features/core/agents/domain/inspection", () => ({ readAgent: vi.fn() }));
vi.mock("@/features/core/agents/domain/revision", () => ({ reviseAgent: vi.fn() }));
vi.mock("@/features/core/agents/domain/pausing", () => ({ setAgentPause: vi.fn() }));
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
import { readAgent } from "@/features/core/agents/domain/inspection";
import { reviseAgent } from "@/features/core/agents/domain/revision";
import { setAgentPause } from "@/features/core/agents/domain/pausing";

const creator = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const stranger = "0x1111111111111111111111111111111111111111";
const token = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
const lowercased = "0xbcd4042de499d14e55001ccbb24a551f3b954096" as const;

const empty = {
  token: lowercased,
  name: null,
  personality: null,
  lore: null,
  style: null,
  topics: [],
  pace: 1,
  pausedAt: null,
  stoppedAt: null,
  graduatedAt: null,
};

const silenced = {
  token: lowercased,
  pausedAt: new Date("2026-05-01T09:00:00.000Z"),
  updatedAt: new Date("2026-05-01T09:00:00.000Z"),
};

const recorded = {
  token: lowercased,
  name: "Vector",
  personality: null,
  lore: null,
  style: null,
  topics: [],
  pace: 1,
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
};

const ask = async (address = token, wallet = creator) =>
  request(app)
    .get(`/api/v1/core/agents/${address}`)
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`);

describe("GET /api/v1/core/agents/{token}", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
    vi.mocked(readAgent).mockResolvedValue(empty);
  });

  it("answers 200 with the agent in the shared envelope, so every success has one shape", async () => {
    const res = await ask();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe(lowercased);
  });

  it("returns the persona, the topics, the pace and the three times, and no derived state word for the panel to trust", async () => {
    const res = await ask();

    expect(Object.keys(res.body.data)).toEqual([
      "token",
      "name",
      "personality",
      "lore",
      "style",
      "topics",
      "pace",
      "pausedAt",
      "stoppedAt",
      "graduatedAt",
    ]);
  });

  it("answers a token the creator has never touched with the empty shape rather than a 404, because the row is not the agent", async () => {
    const res = await ask();

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBeNull();
    expect(res.body.data.pace).toBe(1);
  });

  it("hands the domain the token lowercased, so a creator may send the address in either casing", async () => {
    await ask(token);

    expect(readAgent).toHaveBeenCalledWith({ token: lowercased });
  });

  it("accepts the same token already in lowercase, which is the other form an explorer hands a creator", async () => {
    const res = await ask(lowercased);

    expect(res.status).toBe(200);
    expect(readAgent).toHaveBeenCalledWith({ token: lowercased });
  });

  it("answers 401 with no credential, and never reads the chain for a caller who has not signed in", async () => {
    const res = await request(app).get(`/api/v1/core/agents/${token}`);

    expect(res.status).toBe(401);
    expect(readTokenCreator).not.toHaveBeenCalled();
    expect(readAgent).not.toHaveBeenCalled();
  });

  it("answers 403 for a token the caller did not launch, because naming a wallet is not permission to act on a token", async () => {
    const res = await ask(token, stranger);

    expect(res.status).toBe(403);
    expect(readAgent).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the launchpad does not know, so a typo reads as missing rather than forbidden", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(null);

    const res = await ask();

    expect(res.status).toBe(404);
    expect(readAgent).not.toHaveBeenCalled();
  });

  it("answers 503 when the ownership read cannot reach the chain, never letting the request through on a failed check", async () => {
    vi.mocked(readTokenCreator).mockRejectedValue(
      new ChainUnreachableError(new Error("fetch failed")),
    );

    const res = await ask();

    expect(res.status).toBe(503);
    expect(readAgent).not.toHaveBeenCalled();
  });

  it("answers 503 when the graduation read cannot reach the indexer, so an indexer outage is never read as a locked agent", async () => {
    vi.mocked(readAgent).mockRejectedValue(
      new IndexerUnreachableError(new Error("ECONNREFUSED")),
    );

    const res = await ask();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
  });

  it("answers 400 for a path parameter that is not an address, and never calls the domain", async () => {
    const res = await ask("not-an-address");

    expect(res.status).toBe(400);
    expect(readAgent).not.toHaveBeenCalled();
  });
});

const change = async (body: object, address = token, wallet = creator) =>
  request(app)
    .patch(`/api/v1/core/agents/${address}`)
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`)
    .send(body);

describe("PATCH /api/v1/core/agents/{token}", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
    vi.mocked(reviseAgent).mockResolvedValue(recorded);
  });

  it("answers 200 with what it recorded in the shared envelope, so every success has one shape", async () => {
    const res = await change({ name: "Vector" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Vector");
  });

  it("hands the domain the token lowercased and only the fields the creator sent, so an omitted part is untouched", async () => {
    await change({ lore: "Born in a warehouse" }, token);

    expect(reviseAgent).toHaveBeenCalledWith(
      { token: lowercased },
      { lore: "Born in a warehouse" },
    );
  });

  it("carries a cleared part through to the domain as null, so a creator can delete lore they regret", async () => {
    await change({ lore: null });

    expect(reviseAgent).toHaveBeenCalledWith({ token: lowercased }, { lore: null });
  });

  it("trims the text on the way through the wire, so a persona part is never stored with the space around it", async () => {
    await change({ name: "  Vector  " });

    expect(reviseAgent).toHaveBeenCalledWith({ token: lowercased }, { name: "Vector" });
  });

  it("answers 400 naming the field that broke its cap, so a creator is told which part to trim", async () => {
    const res = await change({ lore: "a".repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("lore");
    expect(reviseAgent).not.toHaveBeenCalled();
  });

  it("answers 400 for a whitespace only persona part rather than storing a blank, because a stray space is not a written character", async () => {
    const res = await change({ personality: "   " });

    expect(res.status).toBe(400);
    expect(reviseAgent).not.toHaveBeenCalled();
  });

  it("answers 400 for a pace outside one to five, so the volume that gets an account flagged never reaches the column", async () => {
    expect((await change({ pace: 6 })).status).toBe(400);
    expect((await change({ pace: 0 })).status).toBe(400);
    expect(reviseAgent).not.toHaveBeenCalled();
  });

  it("answers 400 for an eleventh topic, so the list stays a steer rather than a script", async () => {
    const res = await change({ topics: Array.from({ length: 11 }, (_v, i) => `t${i}`) });

    expect(res.status).toBe(400);
    expect(reviseAgent).not.toHaveBeenCalled();
  });

  it("answers 400 for an unknown field rather than dropping it, so a typo in a field name fails loudly", async () => {
    const res = await change({ name: "Vector", nmae: "Vector" });

    expect(res.status).toBe(400);
    expect(reviseAgent).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that changes nothing, so an empty edit is never mistaken for a successful one", async () => {
    const res = await change({});

    expect(res.status).toBe(400);
    expect(reviseAgent).not.toHaveBeenCalled();
  });

  it("answers 401 with no credential, and never reads the chain for a caller who has not signed in", async () => {
    const res = await request(app)
      .patch(`/api/v1/core/agents/${token}`)
      .send({ name: "Vector" });

    expect(res.status).toBe(401);
    expect(readTokenCreator).not.toHaveBeenCalled();
    expect(reviseAgent).not.toHaveBeenCalled();
  });

  it("answers 403 for a token the caller did not launch, so nobody can rewrite another creator's agent", async () => {
    const res = await change({ name: "Vector" }, token, stranger);

    expect(res.status).toBe(403);
    expect(reviseAgent).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the launchpad does not know, so a typo reads as missing rather than forbidden", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(null);

    const res = await change({ name: "Vector" });

    expect(res.status).toBe(404);
    expect(reviseAgent).not.toHaveBeenCalled();
  });

  it("answers 503 when the ownership read cannot reach the chain, never writing on a failed check", async () => {
    vi.mocked(readTokenCreator).mockRejectedValue(
      new ChainUnreachableError(new Error("fetch failed")),
    );

    const res = await change({ name: "Vector" });

    expect(res.status).toBe(503);
    expect(reviseAgent).not.toHaveBeenCalled();
  });

  it("answers 400 for a path parameter that is not an address, and never calls the domain", async () => {
    const res = await change({ name: "Vector" }, "not-an-address");

    expect(res.status).toBe(400);
    expect(reviseAgent).not.toHaveBeenCalled();
  });
});

const setPause = async (body: object, address = token, wallet = creator) =>
  request(app)
    .put(`/api/v1/core/agents/${address}/pause`)
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`)
    .send(body);

describe("PUT /api/v1/core/agents/{token}/pause", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
    vi.mocked(setAgentPause).mockResolvedValue(silenced);
  });

  it("answers 200 with what it recorded in the shared envelope, so every success has one shape", async () => {
    const res = await setPause({ paused: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pausedAt).toBe(silenced.pausedAt.toISOString());
  });

  it("returns the token, the pause time and the new updatedAt, leaving the persona and the stop to the read that owns them", async () => {
    const res = await setPause({ paused: true });

    expect(Object.keys(res.body.data)).toEqual(["token", "pausedAt", "updatedAt"]);
  });

  it("hands the domain the token lowercased, so a creator may send the address in either casing", async () => {
    await setPause({ paused: true }, token);

    expect(setAgentPause).toHaveBeenCalledWith({ token: lowercased }, { paused: true });
  });

  it("carries a resume through as false, so one route both silences the agent and starts it again", async () => {
    await setPause({ paused: false });

    expect(setAgentPause).toHaveBeenCalledWith({ token: lowercased }, { paused: false });
  });

  it("answers 409 when the domain refuses to resume an agent an AI Launchpad admin stopped, so a creator learns the decision was not theirs to reverse", async () => {
    vi.mocked(setAgentPause).mockRejectedValue(
      ApiError.conflict(
        "An AI Launchpad admin stopped this agent, so it cannot be started again.",
      ),
    );

    const res = await setPause({ paused: false });

    expect(res.status).toBe(409);
  });

  it("answers 400 for a body that never says which state it wants, and never calls the domain", async () => {
    const res = await setPause({});

    expect(res.status).toBe(400);
    expect(setAgentPause).not.toHaveBeenCalled();
  });

  it("answers 400 for a pause that is not a boolean, so a string a panel sent by mistake never reads as a pause", async () => {
    const res = await setPause({ paused: "true" });

    expect(res.status).toBe(400);
    expect(setAgentPause).not.toHaveBeenCalled();
  });

  it("answers 400 for an unknown field rather than dropping it, so a typo in a field name fails loudly", async () => {
    const res = await setPause({ paused: true, pasued: true });

    expect(res.status).toBe(400);
    expect(setAgentPause).not.toHaveBeenCalled();
  });

  it("answers 401 with no credential, and never reads the chain for a caller who has not signed in", async () => {
    const res = await request(app)
      .put(`/api/v1/core/agents/${token}/pause`)
      .send({ paused: true });

    expect(res.status).toBe(401);
    expect(readTokenCreator).not.toHaveBeenCalled();
    expect(setAgentPause).not.toHaveBeenCalled();
  });

  it("answers 403 for a token the caller did not launch, so nobody can silence another creator's agent", async () => {
    const res = await setPause({ paused: true }, token, stranger);

    expect(res.status).toBe(403);
    expect(setAgentPause).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the launchpad does not know, so a typo reads as missing rather than forbidden", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(null);

    const res = await setPause({ paused: true });

    expect(res.status).toBe(404);
    expect(setAgentPause).not.toHaveBeenCalled();
  });

  it("answers 503 when the ownership read cannot reach the chain, never writing on a failed check", async () => {
    vi.mocked(readTokenCreator).mockRejectedValue(
      new ChainUnreachableError(new Error("fetch failed")),
    );

    const res = await setPause({ paused: true });

    expect(res.status).toBe(503);
    expect(setAgentPause).not.toHaveBeenCalled();
  });

  it("answers 400 for a path parameter that is not an address, and never calls the domain", async () => {
    const res = await setPause({ paused: true }, "not-an-address");

    expect(res.status).toBe(400);
    expect(setAgentPause).not.toHaveBeenCalled();
  });
});
