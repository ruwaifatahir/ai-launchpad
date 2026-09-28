import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import request from "supertest";

import app from "@/app";
import prisma from "@/config/database";
import { endIndexer } from "@/lib/indexer/client";
import { cacheRedis, redis } from "@/lib/redis/client";
import {
  ALICE,
  BOB,
  BRAND_NEW,
  CAROL,
  FRESH,
  FRESH_TWIN,
  GRADUATED,
  LAPSED,
  LIST_NOW,
  OTHER,
  REVIVED,
  SMALL_CAP,
  SWEPT,
  TIED_HIGH,
  TIED_LOW,
  UNTRADED,
  WEEK_OLD,
  adminPool,
  deployIndexer,
  dropIndexer,
  ensureDatabase,
} from "@test/e2e/_helpers/indexer";

// Every query a creator's token list makes runs here against Postgres, over the views a
// Ponder deploy leaves in the indexer schema. The creator filter, the order, its tie
// break and the count are SQL, so this suite is where they are proved.
//
// ALICE launched all thirteen tokens of the shared seed, graduated and on their curve
// alike. This suite adds two for BOB, both newer than any of hers, so a query that
// forgot its creator filter would put them first in her list. CAROL launched nothing.

const SHA = "e2e0901";
const BOB_FIRST = `0x${"f1".repeat(20)}`;
const BOB_LATEST = `0x${"f2".repeat(20)}`;

// ALICE's tokens, newest launch first. FRESH and FRESH_TWIN launched in the same
// second, and the last eight all at 900, so each run is ordered by address.
const ALICE_ORDER = [
  BRAND_NEW,
  FRESH,
  FRESH_TWIN,
  WEEK_OLD,
  LAPSED,
  GRADUATED,
  OTHER,
  UNTRADED,
  TIED_LOW,
  TIED_HIGH,
  SWEPT,
  SMALL_CAP,
  REVIVED,
];

const KEY_PATTERNS = ["rl:*", "market:*"];

const clearKeys = async () => {
  for (const pattern of KEY_PATTERNS) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
};

let db: pg.Pool;

// A copy of OTHER's launch row under another token, creator and launch time.
const launch = (token: string, creator: string, at: number) =>
  db.query(
    `INSERT INTO indexer_${SHA}.launch
     SELECT (jsonb_populate_record(launch, jsonb_build_object(
       'token', $1::text,
       'creator', $2::text,
       'launch_timestamp', $3::numeric
     ))).*
     FROM indexer_${SHA}.launch
     WHERE token = $4`,
    [token, creator, at, OTHER],
  );

const created = (wallet: string, query = "") =>
  request(app).get(`/api/v1/market/creators/${wallet}/tokens${query}`);

const tokensOf = (res: request.Response) =>
  (res.body.data.tokens as { token: string }[]).map((item) => item.token);

beforeAll(async () => {
  await ensureDatabase();
  db = adminPool();
  await dropIndexer(db);
  await deployIndexer(db, SHA);
  await launch(BOB_FIRST, BOB, LIST_NOW);
  await launch(BOB_LATEST, BOB, LIST_NOW + 1);
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

describe("a visitor lists the tokens one wallet launched", () => {
  it("lists every one of them newest first, graduated or not, and breaks a tie by address", async () => {
    const res = await created(ALICE);

    expect(res.status).toBe(200);
    expect(tokensOf(res)).toEqual(ALICE_ORDER);
  });

  it("counts only that wallet's tokens", async () => {
    expect((await created(ALICE)).body.data.total).toBe(13);
    expect((await created(BOB)).body.data.total).toBe(2);
  });

  it("leaves out every token another wallet launched", async () => {
    expect(tokensOf(await created(BOB))).toEqual([BOB_LATEST, BOB_FIRST]);
  });

  it("serves graduated tokens and tokens on their curve side by side", async () => {
    const items = (await created(ALICE)).body.data.tokens as {
      token: string;
      graduated: boolean;
    }[];
    const graduated = Object.fromEntries(
      items.map((item) => [item.token, item.graduated]),
    );

    expect(graduated[GRADUATED]).toBe(true);
    expect(graduated[SWEPT]).toBe(false);
    expect(graduated[BRAND_NEW]).toBe(false);
  });

  it("finds the same tokens for an address sent in capitals", async () => {
    const res = await created(`0x${ALICE.slice(2).toUpperCase()}`);

    expect(tokensOf(res)).toEqual(ALICE_ORDER);
  });

  it("answers a wallet that launched nothing with 200, no tokens and a total of 0", async () => {
    const res = await created(CAROL);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ page: 1, pageSize: 24, total: 0, tokens: [] });
  });

  it("pages through the list without skipping or repeating a token", async () => {
    const pages = await Promise.all(
      [1, 2, 3].map((page) => created(ALICE, `?page=${page}&pageSize=6`)),
    );

    expect(pages.flatMap(tokensOf)).toEqual(ALICE_ORDER);
    expect(pages[2].body.data.total).toBe(13);
  });
});

describe("the five second cache", () => {
  it("holds a served page in Redis for five seconds, keyed by the lowercase address", async () => {
    await created(`0x${ALICE.slice(2).toUpperCase()}`);

    const key = `market:v2:creator:creator=${ALICE}&page=1&pageSize=24`;
    const ttl = await redis.ttl(key);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5);
    expect(JSON.parse((await redis.get(key)) as string).total).toBe(13);
  });
});
