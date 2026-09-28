import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The domain is mocked and schema.ts is left real, so validation is exercised
// through the wire rather than around it. Neither the session middleware nor the
// ownership middleware is mocked: their rejections are the contract this route
// publishes, so the chain client underneath them is what stands in.
vi.mock("@/features/core/previews/domain/previewing", () => ({
  takePreview: vi.fn(),
  readPreviewAllowance: vi.fn(),
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
  readPreviewAllowance,
  takePreview,
} from "@/features/core/previews/domain/previewing";

const creator = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const stranger = "0x1111111111111111111111111111111111111111";
const token = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
const lowercased = "0xbcd4042de499d14e55001ccbb24a551f3b954096";
const resetsAt = new Date("2026-09-20T00:00:00.000Z");

const written = {
  text: "The curve holds.",
  reason: null,
  allowance: 20,
  remaining: 19,
  resetsAt,
};

const left = { allowance: 20, remaining: 19, resetsAt };

const take = async (address = token, wallet = creator) =>
  request(app)
    .post(`/api/v1/core/previews/${address}`)
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`);

const ask = async (address = token, wallet = creator) =>
  request(app)
    .get(`/api/v1/core/previews/${address}/allowance`)
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`);

describe("POST /api/v1/core/previews/{token}", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
    vi.mocked(takePreview).mockResolvedValue(written);
  });

  it("answers 200 with the preview in the shared envelope, so every success has one shape", async () => {
    const res = await take();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.text).toBe("The curve holds.");
  });

  it("returns the text, the reason and the allowance, and no cost the creator has no business reading", async () => {
    expect(Object.keys((await take()).body.data)).toEqual([
      "text",
      "reason",
      "allowance",
      "remaining",
      "resetsAt",
    ]);
  });

  it("answers 200 rather than 201, because a preview creates nothing that can be fetched again", async () => {
    expect((await take()).status).toBe(200);
  });

  it("hands the domain the lowercased token, so one token is one key whatever casing the creator copied", async () => {
    await take();

    expect(takePreview).toHaveBeenCalledWith({ token: lowercased });
  });

  it("reads no request body, so a creator cannot steer a preview away from what the agent would write unattended", async () => {
    await request(app)
      .post(`/api/v1/core/previews/${token}`)
      .set("Authorization", `Bearer ${await mintCredential(creator)}`)
      .send({ topic: "the presale", persona: "someone else" });

    expect(takePreview).toHaveBeenCalledWith({ token: lowercased });
  });

  it("refuses a caller with no credential, because a preview spends the creator's allowance", async () => {
    expect((await request(app).post(`/api/v1/core/previews/${token}`)).status).toBe(401);
  });

  it("refuses a wallet that did not launch the token, so one creator cannot spend another's allowance", async () => {
    expect((await take(token, stranger)).status).toBe(403);
  });

  it("answers 404 for a token the launchpad does not know", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(null);

    expect((await take()).status).toBe(404);
  });

  it("answers 400 for a path parameter that is not an address", async () => {
    expect((await take("not-an-address")).status).toBe(400);
  });

  it("carries a refusal through as a 409 with the sentence the domain wrote, so the panel says which state stopped it", async () => {
    vi.mocked(takePreview).mockRejectedValue(
      ApiError.conflict("This token has not graduated, so its agent writes nothing yet."),
    );

    const res = await take();

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("has not graduated");
  });

  it("carries an exhausted allowance through as a 429, distinct from the refusals that are the creator's to fix", async () => {
    vi.mocked(takePreview).mockRejectedValue(
      ApiError.tooManyRequests("You have taken every preview this agent gets today."),
    );

    expect((await take()).status).toBe(429);
  });

  it("carries an unreachable writer through as a 503, so the panel knows the request is worth repeating", async () => {
    vi.mocked(takePreview).mockRejectedValue(
      ApiError.unavailable(
        "The writer could not be reached. This preview was not spent.",
      ),
    );

    expect((await take()).status).toBe(503);
  });

  it("answers 503 when the chain cannot be read for the ownership check, rather than guessing who launched the token", async () => {
    vi.mocked(readTokenCreator).mockRejectedValue(new ChainUnreachableError(new Error()));

    expect((await take()).status).toBe(503);
  });

  it("answers 503 when the graduation read cannot reach the indexer, so an outage never spends a preview or reads as locked", async () => {
    vi.mocked(takePreview).mockRejectedValue(
      new IndexerUnreachableError(new Error("ECONNREFUSED")),
    );

    const res = await take();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
  });
});

describe("GET /api/v1/core/previews/{token}/allowance", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
    vi.mocked(readPreviewAllowance).mockResolvedValue(left);
  });

  it("answers 200 with the allowance, so the panel can show what is left before offering the button", async () => {
    const res = await ask();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ allowance: 20, remaining: 19 });
  });

  it("returns a deliberate subset of what the write returns, leaving out the text and the reason a read cannot have", async () => {
    expect(Object.keys((await ask()).body.data)).toEqual([
      "allowance",
      "remaining",
      "resetsAt",
    ]);
  });

  it("takes no preview, so asking what is left never costs one", async () => {
    await ask();

    expect(takePreview).not.toHaveBeenCalled();
  });

  it("refuses a caller with no credential", async () => {
    expect(
      (await request(app).get(`/api/v1/core/previews/${token}/allowance`)).status,
    ).toBe(401);
  });

  it("refuses a wallet that did not launch the token", async () => {
    expect((await ask(token, stranger)).status).toBe(403);
  });
});
