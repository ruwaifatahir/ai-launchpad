import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The domain is mocked and schema.ts is left real, so validation is exercised
// through the wire rather than around it. The admin middleware is not mocked: the
// rejections are the whole point of a separate authentication surface. The chain
// client is mocked only to prove this route never reaches it, because an admin
// stop does not depend on who launched the token.
vi.mock("@/features/core/agents/domain/stopping", () => ({ stopAgent: vi.fn() }));
// Spread rather than replaced: the error handler reads this module for the error
// classes it maps, and a factory that dropped them would make every failure a 500.
vi.mock("@/lib/chain/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chain/client")>()),
  readTokenCreator: vi.fn(),
}));

import app from "@/app";
import { readTokenCreator } from "@/lib/chain/client";
import { mintCredential } from "@/lib/credential";
import { stopAgent } from "@/features/core/agents/domain/stopping";
import { TEST_ENV } from "@test/helpers/env.mock";

const key = TEST_ENV.ADMIN_API_KEY as string;
const creator = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const token = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
const lowercased = "0xbcd4042de499d14e55001ccbb24a551f3b954096" as const;

const stopped = {
  token: lowercased,
  stoppedAt: new Date("2026-05-01T09:00:00.000Z"),
  updatedAt: new Date("2026-05-01T09:00:00.000Z"),
};

const stop = (
  address = token,
  headers: Record<string, string> = { "X-Admin-Key": key },
) => request(app).put(`/api/v1/core/agents/${address}/admin/stop`).set(headers);

describe("PUT /api/v1/core/agents/{token}/admin/stop", () => {
  beforeEach(() => {
    vi.mocked(stopAgent).mockResolvedValue(stopped);
  });

  it("answers 200 with what it recorded in the shared envelope, so every success has one shape", async () => {
    const res = await stop();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stoppedAt).toBe(stopped.stoppedAt.toISOString());
  });

  it("returns the token, the stop time and the new updatedAt, leaving the persona and the pause to the read that owns them", async () => {
    const res = await stop();

    expect(Object.keys(res.body.data)).toEqual(["token", "stoppedAt", "updatedAt"]);
  });

  it("hands the domain the token lowercased, so an admin may send the address in either casing", async () => {
    await stop(token);

    expect(stopAgent).toHaveBeenCalledWith({ token: lowercased });
  });

  it("answers 401 with no admin key, so the stop is never reachable unauthenticated", async () => {
    const res = await stop(token, {});

    expect(res.status).toBe(401);
    expect(stopAgent).not.toHaveBeenCalled();
  });

  it("answers 401 for a wrong admin key, so guessing the header gets a caller no further", async () => {
    const res = await stop(token, { "X-Admin-Key": `${key}-wrong` });

    expect(res.status).toBe(401);
    expect(stopAgent).not.toHaveBeenCalled();
  });

  it("answers 401 for a creator's bearer credential, so no creator can ever reach an admin action", async () => {
    const res = await stop(token, {
      Authorization: `Bearer ${await mintCredential(creator)}`,
    });

    expect(res.status).toBe(401);
    expect(stopAgent).not.toHaveBeenCalled();
  });

  it("answers 401 for the admin key sent in the authorization header, so the two credentials never travel the same way", async () => {
    const res = await stop(token, { Authorization: `Bearer ${key}` });

    expect(res.status).toBe(401);
    expect(stopAgent).not.toHaveBeenCalled();
  });

  it("never asks the chain who launched the token, because an admin stop does not rest on ownership", async () => {
    await stop();

    expect(readTokenCreator).not.toHaveBeenCalled();
  });

  it("answers 400 for a path parameter that is not an address, and never calls the domain", async () => {
    const res = await stop("not-an-address");

    expect(res.status).toBe(400);
    expect(stopAgent).not.toHaveBeenCalled();
  });

  it("answers 400 for a mistyped address, the same as the creator routes, even though no tokenOwner runs here to catch it", async () => {
    const res = await stop("0xA0Cf798816D4b9b9866b5330EEa46a18382f251f");

    expect(res.status).toBe(400);
    expect(stopAgent).not.toHaveBeenCalled();
  });

  it("checks the admin key before the path parameter, so an unauthenticated caller learns nothing from a malformed address", async () => {
    const res = await stop("not-an-address", {});

    expect(res.status).toBe(401);
  });
});
