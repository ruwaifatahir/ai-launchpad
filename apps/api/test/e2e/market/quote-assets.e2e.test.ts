import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import request from "supertest";

import app from "@/app";
import prisma from "@/config/database";
import { endIndexer } from "@/lib/indexer/client";
import { cacheRedis, redis } from "@/lib/redis/client";
import {
  NVDA,
  OTHER,
  adminPool,
  deployIndexer,
  dropIndexer,
  ensureDatabase,
} from "@test/e2e/_helpers/indexer";

// The quote assets query runs here against Postgres, over the views a Ponder deploy
// leaves in the indexer schema. Picking each address once and the order are SQL, so
// this suite is where they are proved.
//
// The shared seed quotes every launch in native ETH but OTHER, which is in NVDA. This
// suite adds two launches of its own, into its own deploy: one more in NVDA, and one
// in a second token at another address that also calls itself NVDA, with other
// decimals. The second NVDA's address sorts before the first's, so an order on symbol
// alone would most likely return them the wrong way round.

const SHA = "e2e0504";
const ZERO = "0x0000000000000000000000000000000000000000";
const NVDA_TWIN = `0x${"0".repeat(38)}c0`;
const SECOND_NVDA_LAUNCH = `0x${"f1".repeat(20)}`;
const TWIN_LAUNCH = `0x${"f2".repeat(20)}`;

const KEY_PATTERNS = ["rl:*", "market:*"];

const clearKeys = async () => {
  for (const pattern of KEY_PATTERNS) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
};

let db: pg.Pool;

// A copy of OTHER's launch row under another token address, quoted as given.
const copyOther = (token: string, quote: string, decimals: number) =>
  db.query(
    `INSERT INTO indexer_${SHA}.launch
     SELECT (jsonb_populate_record(
       launch,
       jsonb_build_object('token', $1::text, 'quote_asset', $2::text, 'quote_asset_decimals', $3::int)
     )).*
     FROM indexer_${SHA}.launch
     WHERE token = $4`,
    [token, quote, decimals, OTHER],
  );

const quoteAssets = () => request(app).get("/api/v1/market/quote-assets");

beforeAll(async () => {
  await ensureDatabase();
  db = adminPool();
  await dropIndexer(db);
  await deployIndexer(db, SHA);
  await copyOther(SECOND_NVDA_LAUNCH, NVDA, 6);
  await copyOther(TWIN_LAUNCH, NVDA_TWIN, 18);
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

describe("a visitor lists the quote assets for the Pair filter", () => {
  it("lists every quote asset some token uses, each once, by symbol and then address", async () => {
    const res = await quoteAssets();

    expect(res.status).toBe(200);
    expect(res.body.data.quoteAssets).toEqual([
      { address: ZERO, symbol: "ETH", decimals: 18 },
      { address: NVDA_TWIN, symbol: "NVDA", decimals: 18 },
      { address: NVDA, symbol: "NVDA", decimals: 6 },
    ]);
  });

  it("answers an empty list when no token has launched", async () => {
    await db.query(`DROP VIEW indexer.launch`);
    await db.query(
      `CREATE VIEW indexer.launch AS SELECT * FROM indexer_${SHA}.launch WHERE false`,
    );

    try {
      const res = await quoteAssets();

      expect(res.status).toBe(200);
      expect(res.body.data.quoteAssets).toEqual([]);
    } finally {
      await db.query(`DROP VIEW indexer.launch`);
      await db.query(`CREATE VIEW indexer.launch AS SELECT * FROM indexer_${SHA}.launch`);
    }
  });
});

describe("the market rate limit and the five second cache", () => {
  it("counts the request against the market budget, keyed by IP", async () => {
    await quoteAssets();

    expect(await redis.keys("rl:market:*")).not.toHaveLength(0);
  });

  it("holds the list in Redis for five seconds under one key", async () => {
    await quoteAssets();

    const key = "market:v2:quote-assets";
    const ttl = await redis.ttl(key);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5);
    expect(JSON.parse((await redis.get(key)) as string).quoteAssets).toHaveLength(3);
  });
});
