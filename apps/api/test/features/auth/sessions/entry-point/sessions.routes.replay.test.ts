import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createSiweMessage } from "viem/siwe";

// The one HTTP test that leaves the domain real. An entry point test mocks a
// feature's domain files, but a mocked verification.ts can only prove the route repeats
// the mock's answer, and single use is the rejection path this whole feature exists
// for. Only the chain client is mocked; the nonce runs through the Redis mock that
// test/setup.ts already provides. Recorded in the change design note.
//
// Spread rather than replaced: the error handler reads this module for the error
// classes it maps, and a factory that dropped them would make every failure a 500.
vi.mock("@/lib/chain/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chain/client")>()),
  publicClient: { verifySiweMessage: vi.fn() },
}));

import app from "@/app";
import { publicClient } from "@/lib/chain/client";
import { redis } from "@/lib/redis/client";

const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const signature = `0x${"ab".repeat(65)}`;

const signedFor = (nonce: string) => ({
  message: createSiweMessage({
    address: wallet,
    chainId: 46630,
    domain: "localhost:5173",
    nonce,
    uri: "http://localhost:5173/panel",
    version: "1",
  }),
  signature,
});

const takeNonce = async () => {
  const res = await request(app).get("/api/v1/auth/sessions/nonce");
  return res.body.data.nonce as string;
};

describe("the nonce is single use, end to end through the wire", () => {
  beforeEach(() => {
    vi.mocked(publicClient.verifySiweMessage).mockResolvedValue(true);
  });

  it("issues a nonce, stores it for five minutes, and turns the message signed over it into a session", async () => {
    vi.mocked(redis.getdel).mockResolvedValue("1");

    const nonce = await takeNonce();
    expect(redis.setex).toHaveBeenCalledWith(`siwe:nonce:${nonce}`, 300, "1");

    const res = await request(app).post("/api/v1/auth/sessions").send(signedFor(nonce));

    expect(res.status).toBe(201);
    expect(typeof res.body.data.token).toBe("string");
  });

  it("refuses the same signed message the second time, because the first call spent the nonce", async () => {
    vi.mocked(redis.getdel).mockResolvedValueOnce("1").mockResolvedValueOnce(null);

    const body = signedFor(await takeNonce());

    const first = await request(app).post("/api/v1/auth/sessions").send(body);
    const second = await request(app).post("/api/v1/auth/sessions").send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(401);
    expect(second.body.data).toBeUndefined();
  });

  it("issues no session when the nonce was never stored, which is also how an expired one looks", async () => {
    vi.mocked(redis.getdel).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/sessions")
      .send(signedFor("anoncethisbackendneverissued"));

    expect(res.status).toBe(401);
  });

  it("spends the nonce through a single read and delete, so two requests racing it cannot both win", async () => {
    vi.mocked(redis.getdel).mockResolvedValue("1");

    const nonce = await takeNonce();
    await request(app).post("/api/v1/auth/sessions").send(signedFor(nonce));

    expect(redis.getdel).toHaveBeenCalledWith(`siwe:nonce:${nonce}`);
    expect(redis.del).not.toHaveBeenCalled();
  });
});
