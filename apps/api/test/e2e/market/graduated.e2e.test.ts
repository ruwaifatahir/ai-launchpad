import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import request from "supertest";

import app from "@/app";
import prisma from "@/config/database";
import { endIndexer } from "@/lib/indexer/client";
import { cacheRedis, redis } from "@/lib/redis/client";
import {
  ALICE,
  GRADUATED,
  SMALL_CAP,
  SWEPT,
  TIED_HIGH,
  TIED_LOW,
  adminPool,
  deployIndexer,
  dropIndexer,
  ensureDatabase,
} from "@test/e2e/_helpers/indexer";

// Every query the Graduated list makes runs here against Postgres, over the views a
// Ponder deploy leaves in the indexer schema. The graduated filter, the order, its tie
// break and the count are SQL, so this suite is where they are proved.
//
// Four tokens are graduated, by market cap: GRADUATED 50, TIED_LOW and TIED_HIGH 20
// each, SMALL_CAP 9, all in ETH. SWEPT holds the largest market cap of all, 900, but
// only its curve has closed, so it is not listed.

const KEY_PATTERNS = ["rl:*", "market:*"];

const clearKeys = async () => {
  for (const pattern of KEY_PATTERNS) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
};

let db: pg.Pool;

const graduated = (query = "") =>
  request(app).get(`/api/v1/market/tokens/graduated${query}`);

type Item = { token: string; logo: string; progress: number };

const tokensOf = (res: request.Response) =>
  (res.body.data.tokens as Item[]).map((item) => item.token);

const E18 = 10n ** 18n;

beforeAll(async () => {
  await ensureDatabase();
  db = adminPool();
  await dropIndexer(db);
  await deployIndexer(db, "e2e0501");
});

beforeEach(async () => {
  await clearKeys();
});

afterAll(async () => {
  await dropIndexer(db);
  await db.end();
  await endIndexer();
  await clearKeys();
  await redis.quit();
  await cacheRedis.quit();
  await prisma.$disconnect();
});

describe("a visitor lists the graduated tokens", () => {
  it("lists them largest market cap first, comparing amounts as numbers, and breaks a tie by address", async () => {
    const res = await graduated();

    expect(res.status).toBe(200);
    expect(tokensOf(res)).toEqual([GRADUATED, TIED_LOW, TIED_HIGH, SMALL_CAP]);
  });

  it("leaves out a token whose curve has closed but whose pool has not opened", async () => {
    expect(tokensOf(await graduated("?pageSize=50"))).not.toContain(SWEPT);
  });

  it("counts only the graduated tokens", async () => {
    expect((await graduated()).body.data.total).toBe(4);
  });

  it("serves each column read from the indexer, amounts exact and times as numbers", async () => {
    const [first] = (await graduated()).body.data.tokens;

    expect(first).toEqual({
      token: GRADUATED,
      name: "GRAD",
      symbol: "GRAD",
      logo: "",
      creator: ALICE,
      marketCap: (50n * E18).toString(),
      quoteAsset: {
        address: "0x0000000000000000000000000000000000000000",
        symbol: "ETH",
        decimals: 18,
      },
      // Dollar rates are off in this suite's env, so no quote asset has one.
      quoteUsd: null,
      progress: 100,
      graduated: true,
      launchedAt: 900,
      lastBuyAt: 2300,
    });
  });

  it("passes each logo through exactly as the indexer holds it", async () => {
    const items = (await graduated()).body.data.tokens as Item[];
    const logos = Object.fromEntries(items.map((item) => [item.token, item.logo]));

    expect(logos[TIED_HIGH]).toBe("https://example.com/high.png");
    expect(logos[TIED_LOW]).toBe(
      "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    );
  });

  it("answers a page past the end with no tokens and the total", async () => {
    const res = await graduated("?page=2");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokens: [], total: 4, page: 2 });
  });
});

describe("the five second cache", () => {
  it("holds a served page in Redis for five seconds, keyed by page and page size", async () => {
    await graduated("?pageSize=24");

    const key = "market:v2:graduated:page=1&pageSize=24";
    const ttl = await redis.ttl(key);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5);
    expect(JSON.parse((await redis.get(key)) as string).total).toBe(4);
  });
});
