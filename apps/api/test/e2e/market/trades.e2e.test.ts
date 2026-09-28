import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import request from "supertest";

import app from "@/app";
import prisma from "@/config/database";
import { endIndexer } from "@/lib/indexer/client";
import { cacheRedis, redis } from "@/lib/redis/client";
import {
  GRADUATED,
  GRADUATED_ORDER,
  HUGE_AMOUNT,
  OTHER,
  UNKNOWN,
  UNTRADED,
  adminPool,
  createReader,
  deployIndexer,
  dropIndexer,
  dropReader,
  ensureDatabase,
  idOf,
  readerUrl,
} from "@test/e2e/_helpers/indexer";

// Every query the trades route makes runs here against Postgres, over the views a
// Ponder deploy leaves in the indexer schema. A column the indexer renames fails this
// suite rather than a visitor's request.

const READER = "launchpad_reader_e2e";
const READER_PASSWORD = "reader-e2e-password";

// The rate limit counters, and the market cache, so each test reads the indexer
// rather than an answer an earlier test left in Redis.
const KEY_PATTERNS = ["rl:*", "market:*"];

const clearKeys = async () => {
  for (const pattern of KEY_PATTERNS) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
};

let db: pg.Pool;

const trades = (address: string, query = "") =>
  request(app).get(`/api/v1/market/tokens/${address}/trades${query}`);

beforeAll(async () => {
  await ensureDatabase();
  db = adminPool();
  await dropReader(db, READER);
  await dropIndexer(db);
  await deployIndexer(db, "e2e0001");
});

beforeEach(async () => {
  await clearKeys();
});

afterAll(async () => {
  await dropReader(db, READER);
  await dropIndexer(db);
  await db.end();
  await endIndexer();
  await clearKeys();
  await redis.quit();
  await cacheRedis.quit();
  await prisma.$disconnect();
});

describe("a visitor reads a graduated token's trades", () => {
  it("counts every trade the token has, on the curve and in the pool", async () => {
    const res = await trades(GRADUATED);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(12);
  });

  it("carries the token's and the quote asset's decimals and the quote symbol from the launch", async () => {
    expect((await trades(GRADUATED)).body.data).toMatchObject({
      tokenDecimals: 18,
      quoteDecimals: 18,
      quoteSymbol: "ETH",
    });
  });

  it("lists ten a page, newest first, breaking a shared timestamp by block and a shared block by log index", async () => {
    const first = (await trades(GRADUATED)).body.data.trades;
    const second = (await trades(GRADUATED, "?page=2")).body.data.trades;

    const ids = [...first, ...second].map((trade: { id: string }) => trade.id);

    expect(first).toHaveLength(10);
    expect(ids).toEqual(GRADUATED_ORDER);
  });

  it("answers a page past the end with no trades and the total", async () => {
    const res = await trades(GRADUATED, "?page=3");

    expect(res.body.data).toMatchObject({ trades: [], total: 12 });
  });

  it("reads every field of a trade out of the indexer's columns, enums included", async () => {
    const newest = (await trades(GRADUATED)).body.data.trades[0];

    expect(newest).toEqual({
      id: idOf(230, 1),
      side: "buy",
      kind: "user",
      venue: "pool",
      trader: "0x00000000000000000000000000000000000000b1",
      tokenAmount: "1000000000000000000000",
      quoteAmount: "1000000000000000",
      price: 0.000001,
      timestamp: 2300,
      transactionHash: `0x${(230).toString(16).padStart(32, "0")}${"1".padStart(32, "0")}`,
    });
  });

  it("lists the buyback and the fee conversion from one sweep, each with its kind", async () => {
    const listed = (await trades(GRADUATED)).body.data.trades as {
      id: string;
      kind: string;
      side: string;
    }[];

    expect(listed.find((trade) => trade.id === idOf(202, 2))).toMatchObject({
      kind: "buyback",
      side: "buy",
    });
    expect(listed.find((trade) => trade.id === idOf(202, 5))).toMatchObject({
      kind: "fee_conversion",
      side: "sell",
    });
  });

  it("keeps an amount past 64 bits exact, because numeric leaves Postgres as text", async () => {
    const listed = (await trades(GRADUATED)).body.data.trades as {
      id: string;
      tokenAmount: string;
    }[];

    expect(listed.find((trade) => trade.id === idOf(210, 0))?.tokenAmount).toBe(
      HUGE_AMOUNT,
    );
  });

  it("gives a checksummed and a lowercase address the same answer", async () => {
    const checksummed = "0x00000000000000000000000000000000000000A1";
    const upper = await trades(checksummed);

    expect(upper.status).toBe(200);
    expect(upper.body.data.total).toBe(12);
  });
});

describe("a visitor reads other tokens", () => {
  it("lists only the token's own trades, never another's traded in the same seconds", async () => {
    const res = await trades(OTHER);

    expect(res.body.data.total).toBe(2);
    expect(res.body.data.trades.map((trade: { id: string }) => trade.id)).toEqual([
      idOf(225, 0),
      idOf(205, 0),
    ]);
  });

  it("prices a trade quoted in a six decimal asset in six decimals", async () => {
    const { data } = (await trades(OTHER)).body;

    expect(data).toMatchObject({ quoteSymbol: "NVDA", quoteDecimals: 6 });
    expect(data.trades[1].price).toBe(0.75);
  });

  it("answers 200 with no trades for a launched token nobody has traded", async () => {
    const res = await trades(UNTRADED);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ trades: [], total: 0 });
  });

  it("answers 404 for a token the indexer holds no launch for", async () => {
    const res = await trades(UNKNOWN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TOKEN_NOT_FOUND");
  });
});

describe("the five second cache", () => {
  it("holds a served page in Redis for five seconds, under the lowercased token", async () => {
    await trades("0x00000000000000000000000000000000000000A1", "?page=2");

    const key = `market:v2:trades:${GRADUATED}:2`;
    const ttl = await redis.ttl(key);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5);
    expect(JSON.parse((await redis.get(key)) as string).total).toBe(12);
  });

  it("holds nothing for a 404", async () => {
    await trades(UNKNOWN);

    expect(await redis.keys("market:*")).toEqual([]);
  });
});

describe("the read only user", () => {
  let reader: pg.Pool;

  beforeAll(async () => {
    await createReader(db, READER, READER_PASSWORD);
    reader = new pg.Pool({ connectionString: readerUrl(READER, READER_PASSWORD) });
  });

  afterAll(async () => {
    await reader.end();
  });

  const count = async () =>
    (
      await reader.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM indexer.trade WHERE launch = $1",
        [GRADUATED],
      )
    ).rows[0].total;

  it("reads the views in the indexer schema", async () => {
    await expect(count()).resolves.toBe(12);
  });

  it("still reads after a redeploy drops the views and creates them over a new schema", async () => {
    await deployIndexer(db, "e2e0002");

    await expect(count()).resolves.toBe(12);

    const { rows } = await db.query<{ definition: string }>(
      "SELECT pg_get_viewdef('indexer.trade') AS definition",
    );
    expect(rows[0].definition).toContain("indexer_e2e0002");
  });

  it("reads the trade enums as text, the way the trades query casts them", async () => {
    const { rows } = await reader.query<{ side: string; kind: string; venue: string }>(
      `SELECT side::text AS side, kind::text AS kind, venue::text AS venue
       FROM indexer.trade WHERE id = $1`,
      [idOf(202, 2)],
    );

    expect(rows).toEqual([{ side: "buy", kind: "buyback", venue: "pool" }]);
  });

  it("cannot read a sha schema behind the views", async () => {
    await expect(reader.query("SELECT 1 FROM indexer_e2e0002.trade")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot write, even through a table it may read", async () => {
    await expect(
      reader.query("DELETE FROM indexer.trade WHERE launch = $1", [GRADUATED]),
    ).rejects.toThrow(/read-only transaction|permission denied/);
  });
});
