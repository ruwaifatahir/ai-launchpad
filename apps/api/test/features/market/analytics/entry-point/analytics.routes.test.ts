import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { NextFunction, Request, Response } from "express";

// The indexer repo and the stored daily rates are faked, returning rows shaped the way
// their queries select them. The series, the pricing, the totals, the cache and error
// mapping all run for real, so this is the wire contract the Panel reads.
vi.mock("@/features/market/analytics/analytics.repo", () => ({
  findFirstLaunchAt: vi.fn(),
  findLaunchDays: vi.fn(),
  findVolumeDays: vi.fn(),
  countCreators: vi.fn(),
}));

vi.mock("@/features/market/daily-rates/daily-rates.repo", () => ({
  findDailyRates: vi.fn(),
}));

// test/setup.ts lets every limiter through. This one can be told to refuse, so the
// route is proved to sit behind the market limiter.
const { limit } = vi.hoisted(() => ({ limit: { refuse: false } }));

vi.mock("@/features/market/limiter", () => ({
  marketLimiter: (_req: Request, res: Response, next: NextFunction) =>
    limit.refuse ? res.status(429).json({ code: "TOO_MANY_REQUESTS" }) : next(),
}));

import app from "@/app";
import { IndexerUnreachableError } from "@/lib/indexer/client";
import { cacheRedis } from "@/lib/redis/client";
import { TEST_ENV } from "@test/helpers/env.mock";
import { useFakeRedis } from "@test/helpers/redis.fake";
import {
  type VolumeDayRow,
  countCreators,
  findLaunchDays,
  findVolumeDays,
} from "@/features/market/analytics/analytics.repo";
import {
  type StoredRate,
  findDailyRates,
} from "@/features/market/daily-rates/daily-rates.repo";

const ETH = "0x0000000000000000000000000000000000000000";
const NVDA = "0x0ae6ab900fc7f3be5bd9f5137827fa99200373f7";
const NO_FEED = `0x${"c9".repeat(20)}`;

const DAY = 86_400;
const HOUR = 3_600;

// The clock stands at noon on 2026-09-25, so 09-24 is the last full day and the first
// launch was on 09-20.
const D20 = Date.UTC(2026, 8, 20) / 1000;
const D21 = D20 + DAY;
const D22 = D21 + DAY;
const D23 = D22 + DAY;
const D24 = D23 + DAY;
const TODAY = D24 + DAY;
const NOW = (TODAY + 12 * HOUR) * 1000;

const E18 = 10n ** 18n;

const volume = (
  day: number,
  quoteAddress: string,
  raw: bigint,
  quoteDecimals = 18,
  quoteSymbol = "ETH",
): VolumeDayRow => ({
  day,
  quoteAddress,
  quoteSymbol,
  quoteDecimals,
  volume: raw.toString(),
});

// One ETH on 09-20, three NVDA on 09-22 and two ETH on 09-24.
const VOLUME = [
  volume(D20, ETH, E18),
  volume(D22, NVDA, 3_000_000n, 6, "NVDA"),
  volume(D24, ETH, 2n * E18),
];

// Each at the feed's eight decimals. ETH closed 09-20 at 2600 and 09-24 at 2700, and
// NVDA 09-22 at 225.
const rate = (quoteAsset: string, day: number, dollars: number): StoredRate => ({
  quoteAsset,
  day,
  answer: (BigInt(dollars) * 10n ** 8n).toString(),
  decimals: 8,
});

const RATES = [
  rate(ETH, D20, 2600),
  rate(ETH, D21, 2610),
  rate(ETH, D22, 2620),
  rate(NVDA, D22, 225),
  rate(ETH, D23, 2630),
  rate(ETH, D24, 2700),
];

const analytics = () => request(app).get("/api/v1/market/analytics");

beforeEach(() => {
  useFakeRedis();
  TEST_ENV.DOLLAR_RATES = true;
  limit.refuse = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);

  vi.mocked(findLaunchDays).mockResolvedValue([
    { day: D20, launches: 2 },
    { day: D22, launches: 1 },
  ]);
  vi.mocked(findVolumeDays).mockResolvedValue(VOLUME);
  vi.mocked(countCreators).mockResolvedValue(2);
  vi.mocked(findDailyRates).mockResolvedValue(RATES);
});

afterEach(() => {
  TEST_ENV.DOLLAR_RATES = false;
  vi.useRealTimers();
});

describe("GET /api/v1/market/analytics", () => {
  it("answers 200 with no credential, because anyone can open the Analytics page", async () => {
    const res = await analytics();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("serves every figure the page shows, each day's volume at that day's own rate", async () => {
    const { body } = await analytics();

    expect(body.data).toEqual({
      lastFullDay: D24,
      totals: {
        launches: 3,
        creators: 2,
        volumeUsd: 2600 + 675 + 5400,
        averageDailyVolumeUsd: (2600 + 675 + 5400) / 5,
        unpricedDays: 0,
      },
      lastDay: { day: D24, launches: 0, volumeUsd: 5400 },
      priorDay: { day: D23, launches: 0, volumeUsd: 0 },
      series: [
        { day: D20, launches: 2, volumeUsd: 2600 },
        { day: D21, launches: 0, volumeUsd: 0 },
        { day: D22, launches: 1, volumeUsd: 675 },
        { day: D23, launches: 0, volumeUsd: 0 },
        { day: D24, launches: 0, volumeUsd: 5400 },
      ],
      unpricedQuoteAssets: [],
    });
  });

  it("counts every figure to the end of the last full day, so today so far is never in it", async () => {
    await analytics();

    expect(findLaunchDays).toHaveBeenCalledWith(TODAY);
    expect(findVolumeDays).toHaveBeenCalledWith(TODAY);
    expect(countCreators).toHaveBeenCalledWith(TODAY);
  });

  it("reads the stored rates of this chain for the days of the series alone", async () => {
    await analytics();

    expect(findDailyRates).toHaveBeenCalledWith(46630, D20, D24);
  });

  it("adds every quote asset traded on one day, each at its own rate", async () => {
    vi.mocked(findVolumeDays).mockResolvedValue([
      volume(D22, ETH, E18 / 2n),
      volume(D22, NVDA, 2_000_000n, 6, "NVDA"),
    ]);

    const { body } = await analytics();

    expect(body.data.series[2].volumeUsd).toBe(1310 + 450);
  });

  it("serves a day with no rate as null, never zero, and leaves it out of the total", async () => {
    vi.mocked(findDailyRates).mockResolvedValue(
      RATES.filter((stored) => !(stored.quoteAsset === NVDA && stored.day === D22)),
    );

    const { body } = await analytics();

    expect(body.data.series[2]).toEqual({ day: D22, launches: 1, volumeUsd: null });
    expect(body.data.totals).toMatchObject({
      volumeUsd: 8000,
      averageDailyVolumeUsd: 8000 / 5,
      unpricedDays: 1,
    });
  });

  it("prices a day with no trade at zero even with no rate stored for it", async () => {
    vi.mocked(findDailyRates).mockResolvedValue(
      RATES.filter((stored) => stored.day !== D21),
    );

    const { body } = await analytics();

    expect(body.data.series[1].volumeUsd).toBe(0);
    expect(body.data.totals.unpricedDays).toBe(0);
  });

  it("leaves a quote asset with no feed out of every dollar figure, and names it", async () => {
    vi.mocked(findVolumeDays).mockResolvedValue([
      ...VOLUME,
      volume(D24, NO_FEED, 9n * E18, 18, "MYST"),
    ]);

    const { body } = await analytics();

    expect(body.data.series[4].volumeUsd).toBe(5400);
    expect(body.data.totals.unpricedDays).toBe(0);
    expect(body.data.unpricedQuoteAssets).toEqual([{ address: NO_FEED, symbol: "MYST" }]);
  });

  it("names a quote asset with no feed even when it traded only on a day left unpriced", async () => {
    vi.mocked(findVolumeDays).mockResolvedValue([
      volume(D22, NVDA, 3_000_000n, 6, "NVDA"),
      volume(D22, NO_FEED, 9n * E18, 18, "MYST"),
    ]);
    vi.mocked(findDailyRates).mockResolvedValue([]);

    const { body } = await analytics();

    expect(body.data.series[2].volumeUsd).toBeNull();
    expect(body.data.unpricedQuoteAssets).toEqual([{ address: NO_FEED, symbol: "MYST" }]);
  });

  it("serves launches and creators with every dollar figure null while dollar rates are off", async () => {
    TEST_ENV.DOLLAR_RATES = false;

    const { body } = await analytics();

    expect(body.data.totals).toEqual({
      launches: 3,
      creators: 2,
      volumeUsd: null,
      averageDailyVolumeUsd: null,
      unpricedDays: 0,
    });
    expect(body.data.series.map((day: { volumeUsd: null }) => day.volumeUsd)).toEqual(
      Array(5).fill(null),
    );
    expect(body.data.unpricedQuoteAssets).toEqual([]);
    expect(findDailyRates).not.toHaveBeenCalled();
  });

  it("serves an empty series, zero totals and no days before any full day since the first launch", async () => {
    vi.mocked(findLaunchDays).mockResolvedValue([]);
    vi.mocked(findVolumeDays).mockResolvedValue([]);
    vi.mocked(countCreators).mockResolvedValue(0);

    const { body } = await analytics();

    expect(body.data).toEqual({
      lastFullDay: null,
      totals: {
        launches: 0,
        creators: 0,
        volumeUsd: 0,
        averageDailyVolumeUsd: 0,
        unpricedDays: 0,
      },
      lastDay: null,
      priorDay: null,
      series: [],
      unpricedQuoteAssets: [],
    });
  });

  it("serves no prior day when the series holds one day", async () => {
    vi.mocked(findLaunchDays).mockResolvedValue([{ day: D24, launches: 1 }]);
    vi.mocked(findVolumeDays).mockResolvedValue([volume(D24, ETH, E18)]);

    const { body } = await analytics();

    expect(body.data.lastDay).toEqual({ day: D24, launches: 1, volumeUsd: 2700 });
    expect(body.data.priorDay).toBeNull();
  });

  it("carries the same five second Cache-Control as every market route", async () => {
    expect((await analytics()).headers["cache-control"]).toBe("public, max-age=5");
  });

  it("answers 503 when the indexer does not answer, and holds nothing, so the next request asks again", async () => {
    vi.mocked(findLaunchDays).mockRejectedValueOnce(
      new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
    );

    const res = await analytics();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
    expect(cacheRedis.setex).not.toHaveBeenCalled();
    expect((await analytics()).status).toBe(200);
  });

  it("sits behind the market rate limit", async () => {
    limit.refuse = true;

    const res = await analytics();

    expect(res.status).toBe(429);
    expect(findLaunchDays).not.toHaveBeenCalled();
  });

  describe("the cache", () => {
    it("holds the answer until the next midnight UTC, keyed by the last full day", async () => {
      await analytics();

      expect(cacheRedis.setex).toHaveBeenCalledWith(
        `market:v2:analytics:${D24}`,
        12 * HOUR,
        expect.any(String),
      );
    });

    it("answers a repeat request from the cache without reaching the indexer", async () => {
      const first = await analytics();
      vi.setSystemTime(NOW + 11 * HOUR * 1000);
      const second = await analytics();

      expect(second.body).toEqual(first.body);
      expect(findLaunchDays).toHaveBeenCalledTimes(1);
    });

    it("reads again once midnight passes, counting the day that just closed", async () => {
      await analytics();
      vi.setSystemTime(NOW + 12 * HOUR * 1000);

      const { body } = await analytics();

      expect(body.data.lastFullDay).toBe(TODAY);
      expect(findLaunchDays).toHaveBeenCalledTimes(2);
    });

    it("holds an answer with an unpriced day for five minutes, so a rate the job stores shows up soon", async () => {
      vi.mocked(findDailyRates).mockResolvedValue([]);

      await analytics();

      expect(cacheRedis.setex).toHaveBeenCalledWith(
        `market:v2:analytics:${D24}`,
        300,
        expect.any(String),
      );
    });

    it("never holds an unpriced answer past midnight", async () => {
      vi.setSystemTime((TODAY + DAY - 120) * 1000);
      vi.mocked(findDailyRates).mockResolvedValue([]);

      await analytics();

      expect(cacheRedis.setex).toHaveBeenCalledWith(
        `market:v2:analytics:${D24}`,
        120,
        expect.any(String),
      );
    });
  });
});
