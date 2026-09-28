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

// Dollar rates are switched on whatever .env says, so the suite proves the pricing
// without a deployment's switch. Nothing else in env is touched: the real module still
// parses the real .env.
vi.mock("@/config/env", async (importOriginal) => {
  const { env } = await importOriginal<typeof import("@/config/env")>();
  return { env: { ...env, DOLLAR_RATES: true } };
});

import app from "@/app";
import prisma from "@/config/database";
import { env } from "@/config/env";
import { endIndexer } from "@/lib/indexer/client";
import { cacheRedis, redis } from "@/lib/redis/client";
import {
  ALICE,
  BOB,
  CAROL,
  E18,
  OTHER,
  adminPool,
  deployIndexer,
  dropIndexer,
  ensureDatabase,
} from "@test/e2e/_helpers/indexer";

// Every query the analytics route makes runs here against Postgres, over the views a
// Ponder deploy leaves in the indexer schema, and the stored daily rates are read from
// the backend's own Postgres. The day grouping, the cut at the last full day, distinct
// creators and each quote asset's decimals are SQL, so this suite is where they are
// proved.
//
// The shared seed's launches all date from 1970, so this suite empties its deploy and
// seeds its own. The clock is held at noon on 2026-09-25, so 09-24 is the last full
// day.
//
//   launch  creator  launched            quote
//   FIRST   ALICE    09-20 00:00:00      ETH, 18 decimals
//   LATE    ALICE    09-20 23:59:59      NVDA, 6 decimals
//   MIDDLE  BOB      09-22 10:00         ETH
//   TODAY   CAROL    09-25 01:00         ETH, after the cut
//
// User volume by hour, and the rate each day closed at:
//
//   day    hour          volume          rate
//   09-20  23:00 FIRST   1 ETH           ETH 2000
//          23:00 LATE    3 NVDA          NVDA 200
//   09-21  00:00 FIRST   2 ETH           ETH 2100
//   09-22  -                             ETH 2200
//   09-23  -, a buyback in the trade table only
//   09-24  23:00 MIDDLE  4 ETH           ETH 2400
//   09-25  00:00 MIDDLE  100 ETH, after the cut

const SHA = "e2e0801";
const ETH = "0x0000000000000000000000000000000000000000";
// The testnet NVDA the feed table prices.
const NVDA = "0x0ae6ab900fc7f3be5bd9f5137827fa99200373f7";

const FIRST = `0x${"e1".repeat(20)}`;
const LATE = `0x${"e2".repeat(20)}`;
const MIDDLE = `0x${"e3".repeat(20)}`;
const TODAY_LAUNCH = `0x${"e4".repeat(20)}`;

const DAY = 86_400;
const HOUR = 3_600;
const D20 = Date.UTC(2026, 8, 20) / 1000;
const D21 = D20 + DAY;
const D22 = D21 + DAY;
const D23 = D22 + DAY;
const D24 = D23 + DAY;
const TODAY = D24 + DAY;
const NOW = (TODAY + 12 * HOUR) * 1000;

const KEY_PATTERNS = ["rl:*", "market:*"];

const clearKeys = async () => {
  for (const pattern of KEY_PATTERNS) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
};

let db: pg.Pool;

// A copy of OTHER's launch row under another token, creator, launch time and quote.
const launch = (
  token: string,
  creator: string,
  at: number,
  quote: string,
  symbol: string,
  decimals: number,
) =>
  db.query(
    `INSERT INTO indexer_${SHA}.launch
     SELECT (jsonb_populate_record(launch, jsonb_build_object(
       'token', $1::text,
       'creator', $2::text,
       'launch_timestamp', $3::numeric,
       'quote_asset', $4::text,
       'quote_asset_symbol', $5::text,
       'quote_asset_decimals', $6::int
     ))).*
     FROM indexer_${SHA}.launch
     WHERE token = $7`,
    [token, creator, at, quote, symbol, decimals, OTHER],
  );

const hour = (token: string, start: number, volume: bigint) =>
  db.query(`INSERT INTO indexer_${SHA}.launch_hour VALUES ($1, $2, $3, 1, 0)`, [
    token,
    start,
    volume.toString(),
  ]);

const DAYS = [D20, D21, D22, D23, D24, TODAY].map((day) => new Date(day * 1000));

const storeRate = (quoteAsset: string, day: number, dollars: number) =>
  prisma.dailyRate.create({
    data: {
      chainId: env.CHAIN_ID,
      quoteAsset,
      day: new Date(day * 1000),
      answer: (BigInt(dollars) * 10n ** 8n).toString(),
      decimals: 8,
      feed: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9",
      roundId: ((1n << 64n) + 1n).toString(),
      roundUpdatedAt: new Date((day + DAY - 60) * 1000),
    },
  });

const clearRates = () =>
  prisma.dailyRate.deleteMany({ where: { chainId: env.CHAIN_ID, day: { in: DAYS } } });

const analytics = () => request(app).get("/api/v1/market/analytics");

beforeAll(async () => {
  await ensureDatabase();
  db = adminPool();
  await dropIndexer(db);
  await deployIndexer(db, SHA);

  await launch(FIRST, ALICE, D20, ETH, "ETH", 18);
  await launch(LATE, ALICE, D21 - 1, NVDA, "NVDA", 6);
  await launch(MIDDLE, BOB, D22 + 10 * HOUR, ETH, "ETH", 18);
  await launch(TODAY_LAUNCH, CAROL, TODAY + HOUR, ETH, "ETH", 18);
  await db.query(
    `DELETE FROM indexer_${SHA}.launch WHERE token NOT IN ($1, $2, $3, $4)`,
    [FIRST, LATE, MIDDLE, TODAY_LAUNCH],
  );
  await db.query(`DELETE FROM indexer_${SHA}.launch_hour`);
  await db.query(`DELETE FROM indexer_${SHA}.trade`);

  await hour(FIRST, D21 - HOUR, E18);
  await hour(LATE, D21 - HOUR, 3_000_000n);
  await hour(FIRST, D21, 2n * E18);
  await hour(MIDDLE, TODAY - HOUR, 4n * E18);
  await hour(MIDDLE, TODAY, 100n * E18);

  // A buyback of 50 ETH on 09-23. The indexer never counts one into launch_hour, so it
  // lives in the trade table alone, where the route must not look.
  await db.query(
    `INSERT INTO indexer_${SHA}.trade VALUES
      ('buyback', 46630, $1, 'pool', 'buyback', 'buy', $2, $3, $4, 0, 0, 'quote_asset',
       300, $5, $6, 0)`,
    [
      MIDDLE,
      BOB,
      E18.toString(),
      (50n * E18).toString(),
      D23 + HOUR,
      `0x${"ab".repeat(32)}`,
    ],
  );

  await clearRates();
  await storeRate(ETH, D20, 2000);
  await storeRate(NVDA, D20, 200);
  await storeRate(ETH, D21, 2100);
  await storeRate(ETH, D22, 2200);
  await storeRate(ETH, D24, 2400);
});

beforeEach(async () => {
  await clearKeys();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await clearRates();
  await dropIndexer(db);
  await db.end();
  await endIndexer();
  await clearKeys();
  await redis.quit();
  await cacheRedis.quit();
  await prisma.$disconnect();
});

describe("GET /api/v1/market/analytics, against Postgres", () => {
  it("serves one entry per UTC day from the first launch's day to the last full day, zeros included", async () => {
    const { body } = await analytics();

    expect(body.data.series).toEqual([
      { day: D20, launches: 2, volumeUsd: 2000 + 600 },
      { day: D21, launches: 0, volumeUsd: 4200 },
      { day: D22, launches: 1, volumeUsd: 0 },
      { day: D23, launches: 0, volumeUsd: 0 },
      { day: D24, launches: 0, volumeUsd: 9600 },
    ]);
  });

  it("counts a launch in its UTC day's first and last second into that day", async () => {
    const { body } = await analytics();

    expect(body.data.series[0].launches).toBe(2);
  });

  it("counts the hour starting at midnight into the day it starts, not the day before", async () => {
    const { body } = await analytics();

    expect(body.data.series[1].volumeUsd).toBe(4200);
  });

  it("scales each quote asset's volume by its own decimals before pricing it", async () => {
    const { body } = await analytics();

    // 1 ETH at 2000 and 3 NVDA, raw 3000000 at 6 decimals, at 200.
    expect(body.data.series[0].volumeUsd).toBe(2600);
  });

  it("counts user trades alone, so a buyback in the trade table adds nothing", async () => {
    const { body } = await analytics();

    expect(body.data.series[3].volumeUsd).toBe(0);
  });

  it("stops every figure at the end of the last full day: today's launch, creator and volume are in none of them", async () => {
    const { body } = await analytics();

    expect(body.data.lastFullDay).toBe(D24);
    expect(body.data.totals).toEqual({
      launches: 3,
      creators: 2,
      volumeUsd: 2600 + 4200 + 9600,
      averageDailyVolumeUsd: (2600 + 4200 + 9600) / 5,
      unpricedDays: 0,
    });
    expect(body.data.lastDay).toEqual({ day: D24, launches: 0, volumeUsd: 9600 });
    expect(body.data.priorDay).toEqual({ day: D23, launches: 0, volumeUsd: 0 });
  });

  it("counts a wallet that launched twice as one creator", async () => {
    const { body } = await analytics();

    expect(body.data.totals.creators).toBe(2);
  });

  it("counts today's figures once today has closed, at the day's own rate", async () => {
    await storeRate(ETH, TODAY, 3000);
    vi.setSystemTime((TODAY + DAY + HOUR) * 1000);

    const { body } = await analytics();

    expect(body.data.lastDay).toEqual({ day: TODAY, launches: 1, volumeUsd: 300_000 });
    expect(body.data.totals).toMatchObject({ launches: 4, creators: 3 });
  });

  it("serves a day whose rate is missing as unpriced, and holds that answer five minutes", async () => {
    await prisma.dailyRate.deleteMany({
      where: { chainId: env.CHAIN_ID, quoteAsset: ETH, day: new Date(D21 * 1000) },
    });

    const { body } = await analytics();

    expect(body.data.series[1].volumeUsd).toBeNull();
    expect(body.data.totals.unpricedDays).toBe(1);
    expect(await redis.ttl(`market:v2:analytics:${D24}`)).toBeLessThanOrEqual(300);

    await storeRate(ETH, D21, 2100);
  });
});
