import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type pg from "pg";
import request from "supertest";

import app from "@/app";
import prisma from "@/config/database";
import { endIndexer } from "@/lib/indexer/client";
import { cacheRedis, redis } from "@/lib/redis/client";
import {
  GRADUATED,
  OTHER,
  UNKNOWN,
  UNTRADED,
  adminPool,
  deployIndexer,
  dropIndexer,
  ensureDatabase,
} from "@test/e2e/_helpers/indexer";

// Every query the chart route makes runs here against Postgres, over the views a
// Ponder deploy leaves in the indexer schema. The grouping into buckets and the pick
// of each bucket's last trade are SQL, so this suite is where they are proved.
//
// The seed's trades sit at unix seconds 1000 to 2300, so the clock is moved there.
// The graduated token's curve trades run to 1200 and its pool trades start at 2000.
// Most trade at 0.000001. The curve trade at 1200 is at 0.25. In the pool, the
// buyback at 2020 is at 0.000002 and the fee conversion after it at 0.000003.
// The pool trade at 2100 moves far more tokens, so its price is close to zero.

const KEY_PATTERNS = ["rl:*", "market:*"];

const clearKeys = async () => {
  for (const pattern of KEY_PATTERNS) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
};

let db: pg.Pool;

const chart = (address: string, range: string) =>
  request(app).get(`/api/v1/market/tokens/${address}/chart?range=${range}`);

const now = (seconds: number) => vi.setSystemTime(seconds * 1000);

beforeAll(async () => {
  await ensureDatabase();
  db = adminPool();
  await dropIndexer(db);
  await deployIndexer(db, "e2e0101");
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  await clearKeys();
});

afterEach(() => {
  vi.useRealTimers();
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

describe("a visitor charts a graduated token", () => {
  it("groups the last five minutes into fifteen second buckets, oldest first, leaving out empty ones", async () => {
    now(2310);

    const { data } = (await chart(GRADUATED, "5m")).body;

    expect(data.bucketSeconds).toBe(15);
    expect(data.points.map((point: { t: number }) => point.t)).toEqual([
      2010, 2100, 2190, 2295,
    ]);
  });

  it("counts the buyback and the fee conversion in their bucket, and prices it by its last trade, the fee conversion on the later log", async () => {
    now(2310);

    const [sweep] = (await chart(GRADUATED, "5m")).body.data.points;

    // The trade at 2010, then the buyback and the fee conversion sharing block 202.
    expect(sweep).toMatchObject({ t: 2010, tradeCount: 3 });
    expect(sweep.price).toBeCloseTo(0.000003, 12);
    expect(sweep.volume).toBeCloseTo(0.006);
  });

  it("runs through graduation, from the curve's trades into the pool's", async () => {
    now(2310);

    const { data } = (await chart(GRADUATED, "1h")).body;

    expect(data.points.map((point: { t: number }) => point.t)).toEqual([
      990, 1095, 1200, 1995, 2010, 2100, 2190, 2295,
    ]);
    expect(data.points[0]).toMatchObject({ tradeCount: 3, price: 0.000001 });
    expect(data.points[2]).toMatchObject({ tradeCount: 1, price: 0.25, volume: 1 });
  });

  it("carries the current supply and the quote asset from the launch", async () => {
    now(2310);

    expect((await chart(GRADUATED, "1h")).body.data).toMatchObject({
      tokenDecimals: 18,
      supply: (10n ** 27n).toString(),
      quoteSymbol: "ETH",
      quoteDecimals: 18,
    });
  });

  it("measures change from the last curve trade before the range to the latest pool trade", async () => {
    // The hour from 1400: after the curve closed, before the pool opened.
    now(5000);

    const { data } = (await chart(GRADUATED, "1h")).body;

    // Opened at 0.25 on the curve at 1200, and closes at 0.000001 in the pool.
    expect(data.points.map((point: { t: number }) => point.t)).toEqual([
      1995, 2010, 2100, 2190, 2295,
    ]);
    expect(data.change).toBeCloseTo((0.000001 / 0.25 - 1) * 100);
  });

  it("opens the range at a trade made exactly at its start", async () => {
    // The hour from 1200, the second the curve's 0.25 trade was made.
    now(4800);

    expect((await chart(GRADUATED, "1h")).body.data.change).toBeCloseTo(
      (0.000001 / 0.25 - 1) * 100,
    );
  });

  it("charts all of the token's history in hour buckets, every trade counted", async () => {
    now(2310);

    const { data } = (await chart(GRADUATED, "all")).body;

    expect(data.bucketSeconds).toBe(3600);
    expect(data.points).toHaveLength(1);
    expect(data.points[0]).toMatchObject({ t: 0, tradeCount: 12, price: 0.000001 });
    expect(data.points[0].volume).toBeCloseTo(1.014);
  });
});

describe("a visitor charts other tokens", () => {
  it("charts only the token's own trades, in its six decimal quote asset, measuring change from its first price when nothing traded before the range", async () => {
    now(2310);

    const { data } = (await chart(OTHER, "6h")).body;

    expect(data).toMatchObject({ quoteSymbol: "NVDA", quoteDecimals: 6 });
    expect(data.points).toEqual([
      { t: 2040, price: 0.75, volume: 3, tradeCount: 1 },
      { t: 2220, price: 1, volume: 1, tradeCount: 1 },
    ]);
    expect(data.change).toBeCloseTo((1 / 0.75 - 1) * 100);
  });

  it("answers a launched token nobody has traded with no points and a null change", async () => {
    now(2310);

    const res = await chart(UNTRADED, "1d");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ points: [], change: null });
  });

  it("answers 404 for a token the indexer holds no launch for", async () => {
    const res = await chart(UNKNOWN, "1d");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TOKEN_NOT_FOUND");
  });
});

describe("the five second cache", () => {
  it("holds a chart in Redis for five seconds, under the lowercased token and the range", async () => {
    now(2310);
    await chart("0x00000000000000000000000000000000000000A1", "6h");

    const key = `market:v2:chart:${GRADUATED}:6h`;
    const ttl = await redis.ttl(key);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5);
    expect(JSON.parse((await redis.get(key)) as string).range).toBe("6h");
  });
});
