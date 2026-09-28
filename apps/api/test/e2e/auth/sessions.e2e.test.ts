import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createSiweMessage } from "viem/siwe";

import app from "@/app";
import prisma from "@/config/database";
import { env } from "@/config/env";
import { publicClient } from "@/lib/chain/client";
import { mintCredential } from "@/lib/credential";
import { redis } from "@/lib/redis/client";
import { identity, panelDomain, panelUri } from "@test/e2e/_helpers/env";

const creator = identity("creator");
const stranger = identity("stranger");

const NONCE_KEYS = "siwe:nonce:*";
const RATE_KEYS = "rl:*";

const clear = async (...patterns: string[]) => {
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
};

const askForNonce = () => request(app).get("/api/v1/auth/sessions/nonce");

const freshNonce = async () => (await askForNonce()).body.data.nonce as string;

const messageFor = (nonce: string, address = creator.address) =>
  createSiweMessage({
    address,
    chainId: env.CHAIN_ID,
    domain: panelDomain,
    nonce,
    uri: panelUri,
    version: "1",
  });

const signedBy = async (account: typeof creator, message: string) => ({
  message,
  signature: await account.signMessage({ message }),
});

const openSession = (body: { message: string; signature: string }) =>
  request(app).post("/api/v1/auth/sessions").send(body);

const asWallet = async (wallet: string) =>
  request(app)
    .get("/api/v1/auth/sessions/current")
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`);

beforeAll(async () => {
  await clear(NONCE_KEYS, RATE_KEYS);
});

beforeEach(async () => {
  await clear(RATE_KEYS);
});

afterAll(async () => {
  await clear(NONCE_KEYS, RATE_KEYS).catch(() => clear(NONCE_KEYS, RATE_KEYS));
  await redis.quit();
  await prisma.$disconnect();
});

describe("a caller asks for a nonce", () => {
  it("stores the nonce it hands out, so the value a wallet signs is the value the backend will look for", async () => {
    const nonce = await freshNonce();

    await expect(redis.get(`siwe:nonce:${nonce}`)).resolves.toBe("1");
  });

  it("gives the nonce five minutes to live, so one that is never signed dies without anything having to delete it", async () => {
    const nonce = await freshNonce();

    const ttl = await redis.ttl(`siwe:nonce:${nonce}`);

    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);
  });
});

describe("a wallet signs the nonce and opens a session", () => {
  it("turns a real wallet signature into a credential the session middleware accepts", async () => {
    const opened = await openSession(
      await signedBy(creator, messageFor(await freshNonce())),
    );

    expect(opened.status).toBe(201);

    const current = await request(app)
      .get("/api/v1/auth/sessions/current")
      .set("Authorization", `Bearer ${opened.body.data.token}`);

    expect(current.status).toBe(200);
    expect(current.body.data).toEqual({ wallet: creator.address });
  });

  it("rejects a message the wallet it names did not sign, which is the check only the node can make", async () => {
    const message = messageFor(await freshNonce(), creator.address);

    const res = await openSession(await signedBy(stranger, message));

    expect(res.status).toBe(401);
  });

  it("spends the nonce before it checks the signature, so a caller cannot grind signatures against one nonce", async () => {
    const nonce = await freshNonce();
    const message = messageFor(nonce, creator.address);

    await openSession(await signedBy(stranger, message));

    await expect(redis.get(`siwe:nonce:${nonce}`)).resolves.toBeNull();
  });

  it("issues no session for a nonce it never handed out, which is also how an expired one looks", async () => {
    const message = messageFor("anoncethisbackendneverissued");

    const res = await openSession(await signedBy(creator, message));

    expect(res.status).toBe(401);
  });
});

describe("two callers race the same nonce", () => {
  it("lets exactly one of two simultaneous requests carrying one signed message win, because getdel is a single command", async () => {
    const body = await signedBy(creator, messageFor(await freshNonce()));

    const [first, second] = await Promise.all([openSession(body), openSession(body)]);

    expect([first.status, second.status].sort()).toEqual([201, 401]);
  });
});

describe("the backend and the node it verifies against", () => {
  it("demands the chain id of the node it checks signatures with, so a wallet on the live chain can sign in at all", async () => {
    await expect(publicClient.getChainId()).resolves.toBe(env.CHAIN_ID);
  });
});

describe("the rate limiter counts against real redis", () => {
  it("answers 429 once one caller has spent the nonce budget, which is the only guard the unauthenticated write has", async () => {
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 11; attempt += 1)
      statuses.push((await askForNonce()).status);

    expect(statuses.slice(0, 10)).toEqual(Array<number>(10).fill(200));
    expect(statuses[10]).toBe(429);
  });

  it("counts a credentialed caller against its wallet rather than its address, so two creators behind one IP get a budget each", async () => {
    await asWallet(creator.address);
    await asWallet(stranger.address);

    const keys = await redis.keys(RATE_KEYS);

    expect(keys).toContain(`rl:${creator.address}`);
    expect(keys).toContain(`rl:${stranger.address}`);
  });
});
