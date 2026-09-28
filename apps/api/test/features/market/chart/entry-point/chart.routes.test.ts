import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Only the indexer repos are faked, returning rows shaped the way the SQL in them
// selects. The grouping into buckets is SQL, so it runs for real in the e2e suite;
// here the window and bucket size each range asks for, the points, change, validation,
// error mapping and the cache all run for real.
vi.mock("@/features/market/launches/launches.repo", () => ({
  findLaunchByToken: vi.fn(),
}));
// Dollar rates are read from Chainlink, which a route test never reaches. The reading
// itself is proved in test/features/market/dollar-rates.
vi.mock("@/features/market/dollar-rates/reading", () => ({ readDollarRate: vi.fn() }));
vi.mock("@/features/market/chart/chart.repo", () => ({
  findChartBuckets: vi.fn(),
  findLastTradeAtOrBefore: vi.fn(),
}));

import app from "@/app";
import { IndexerUnreachableError } from "@/lib/indexer/client";
import { cacheRedis } from "@/lib/redis/client";
import { useFakeRedis } from "@test/helpers/redis.fake";
import { findLaunchByToken } from "@/features/market/launches/launches.repo";
import { readDollarRate } from "@/features/market/dollar-rates/reading";
import {
  type BucketRow,
  findChartBuckets,
  findLastTradeAtOrBefore,
} from "@/features/market/chart/chart.repo";

const token = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
const lowercased = "0xbcd4042de499d14e55001ccbb24a551f3b954096";

const E18 = 10n ** 18n;
const SUPPLY = (10n ** 9n * E18).toString();

const launch = {
  curve: `0x${"cc".repeat(20)}`,
  creator: `0x${"dd".repeat(20)}`,
  quoteAddress: "0x0000000000000000000000000000000000000000",
  quoteSymbol: "ETH",
  quoteDecimals: 18,
  supply: SUPPLY,
};

// The clock the tests run at, in unix seconds.
const NOW = Date.parse("2026-09-26T12:00:00Z") / 1000;

// A trade of one token for the given ether, so its price is that many ether.
const at = (ether: number) => ({
  tokenAmount: E18.toString(),
  quoteAmount: (BigInt(Math.round(ether * 1e6)) * 10n ** 12n).toString(),
});

const bucket = (t: number, ether: number, overrides: Partial<BucketRow> = {}) => ({
  t: String(t),
  tradeCount: 1,
  volume: at(ether).quoteAmount,
  ...at(ether),
  ...overrides,
});

const chart = (address = token, query = "?range=1h") =>
  request(app).get(`/api/v1/market/tokens/${address}/chart${query}`);

describe("GET /api/v1/market/tokens/{token}/chart", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW * 1000);
    useFakeRedis();
    vi.mocked(findLaunchByToken).mockResolvedValue(launch);
    vi.mocked(findChartBuckets).mockResolvedValue([bucket(NOW - 60, 2)]);
    vi.mocked(findLastTradeAtOrBefore).mockResolvedValue(at(1));
    vi.mocked(readDollarRate).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers 200 with no credential, because anyone can read a token's page", async () => {
    const res = await chart();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("lets a browser hold a success for the same five seconds the backend does", async () => {
    const res = await chart();

    expect(res.headers["cache-control"]).toBe("public, max-age=5");
  });

  it("never lets a browser hold a 404, so a token the indexer reaches a moment later shows at once", async () => {
    vi.mocked(findLaunchByToken).mockResolvedValue(null);

    const res = await chart();

    expect(res.status).toBe(404);
    expect(res.headers["cache-control"]).toBeUndefined();
  });

  it("carries the supply, quote symbol and quote decimals the Panel turns a price into market cap with", async () => {
    const { body } = await chart();

    expect(body.data).toMatchObject({
      range: "1h",
      tokenDecimals: 18,
      supply: SUPPLY,
      quoteSymbol: "ETH",
      quoteDecimals: 18,
    });
  });

  it("carries the quote asset's dollar rate beside its symbol, for the Panel's figures in dollars", async () => {
    vi.mocked(readDollarRate).mockResolvedValue(2691.3);

    const { body } = await chart();

    expect(body.data).toMatchObject({ quoteSymbol: "ETH", quoteUsd: 2691.3 });
    expect(readDollarRate).toHaveBeenCalledWith(launch.quoteAddress);
  });

  it("serves a null dollar rate for a quote asset with none", async () => {
    const { body } = await chart();

    expect(body.data.quoteUsd).toBeNull();
  });

  it("serves each point with its bucket start, its last trade's price, its volume and its trade count", async () => {
    vi.mocked(findChartBuckets).mockResolvedValue([
      bucket(NOW - 30, 0.25, {
        tradeCount: 3,
        volume: (E18 + E18 / 2n).toString(),
      }),
    ]);

    expect((await chart()).body.data.points).toEqual([
      { t: NOW - 30, price: 0.25, volume: 1.5, tradeCount: 3 },
    ]);
  });

  it("reads prices and volume in the quote asset's own decimals, so six decimals are not read as eighteen", async () => {
    vi.mocked(findLaunchByToken).mockResolvedValue({
      ...launch,
      quoteSymbol: "USDC",
      quoteDecimals: 6,
    });
    vi.mocked(findChartBuckets).mockResolvedValue([
      {
        t: String(NOW - 30),
        tradeCount: 1,
        volume: "3000000",
        tokenAmount: (4n * E18).toString(),
        quoteAmount: "3000000",
      },
    ]);

    const [point] = (await chart()).body.data.points;

    expect(point).toMatchObject({ price: 0.75, volume: 3 });
  });

  it("serves the points in the order the indexer returned them, which the query sets oldest first", async () => {
    vi.mocked(findChartBuckets).mockResolvedValue([
      bucket(NOW - 45, 1),
      bucket(NOW - 30, 2),
    ]);

    const times = (await chart()).body.data.points.map((point: { t: number }) => point.t);

    expect(times).toEqual([NOW - 45, NOW - 30]);
  });

  it.each([
    ["5m", 5 * 60, 15],
    ["1h", 60 * 60, 15],
    ["6h", 6 * 60 * 60, 60],
    ["1d", 24 * 60 * 60, 300],
  ])(
    "reads %s back from now in buckets of the size Pons uses",
    async (range, span, bucketSeconds) => {
      const res = await chart(token, `?range=${range}`);

      expect(res.body.data.bucketSeconds).toBe(bucketSeconds);
      expect(findChartBuckets).toHaveBeenCalledWith(lowercased, {
        from: NOW - span,
        bucketSeconds,
      });
      expect(findLastTradeAtOrBefore).toHaveBeenCalledWith(lowercased, NOW - span);
    },
  );

  it("reads all from the token's first trade in hour buckets", async () => {
    const res = await chart(token, "?range=all");

    expect(res.body.data.bucketSeconds).toBe(3600);
    expect(findChartBuckets).toHaveBeenCalledWith(lowercased, {
      from: 0,
      bucketSeconds: 3600,
    });
  });

  describe("change", () => {
    it("is the latest price over the last price at or before the range start, as a percent", async () => {
      vi.mocked(findLastTradeAtOrBefore).mockResolvedValue(at(2));
      vi.mocked(findChartBuckets).mockResolvedValue([
        bucket(NOW - 600, 1),
        bucket(NOW - 30, 2.5),
      ]);

      expect((await chart()).body.data.change).toBeCloseTo(25);
    });

    it("measures from the price before the range, so a jump into the range's first trade counts", async () => {
      vi.mocked(findLastTradeAtOrBefore).mockResolvedValue(at(1));
      vi.mocked(findChartBuckets).mockResolvedValue([bucket(NOW - 30, 3)]);

      expect((await chart()).body.data.change).toBeCloseTo(200);
    });

    it("uses the first price in the range for a token with no trade before it", async () => {
      vi.mocked(findLastTradeAtOrBefore).mockResolvedValue(null);
      vi.mocked(findChartBuckets).mockResolvedValue([
        bucket(NOW - 600, 4),
        bucket(NOW - 30, 3),
      ]);

      expect((await chart()).body.data.change).toBeCloseTo(-25);
    });

    it("uses the first price for all, which has no trade before it", async () => {
      vi.mocked(findChartBuckets).mockResolvedValue([bucket(3600, 1), bucket(7200, 1.1)]);

      const res = await chart(token, "?range=all");

      expect(res.body.data.change).toBeCloseTo(10);
      expect(findLastTradeAtOrBefore).not.toHaveBeenCalled();
    });

    it("is zero for a token that traded before the range and not in it, because its price has not moved", async () => {
      vi.mocked(findChartBuckets).mockResolvedValue([]);

      const res = await chart();

      expect(res.body.data).toMatchObject({ points: [], change: 0 });
    });

    it("is null for a token with no trade at all", async () => {
      vi.mocked(findLastTradeAtOrBefore).mockResolvedValue(null);
      vi.mocked(findChartBuckets).mockResolvedValue([]);

      const res = await chart();

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ points: [], change: null });
    });
  });

  it("reads the lowercased address, so a checksummed and a lowercase address give the same answer", async () => {
    await chart(token);

    expect(findLaunchByToken).toHaveBeenCalledWith(lowercased);
  });

  it.each([
    ["an address that is not one", "not-an-address", "?range=1h"],
    [
      "an address whose capitals break its checksum",
      token.replace("Bcd", "BCD"),
      "?range=1h",
    ],
    ["a range not in the list", token, "?range=1w"],
    ["a range in the wrong case", token, "?range=1H"],
    ["no range", token, ""],
  ])("answers 400 for %s", async (_label, address, query) => {
    const res = await chart(address, query);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(findLaunchByToken).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the indexer holds no launch for", async () => {
    vi.mocked(findLaunchByToken).mockResolvedValue(null);

    const res = await chart();

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TOKEN_NOT_FOUND");
    expect(findChartBuckets).not.toHaveBeenCalled();
  });

  it("answers 503 when the indexer does not answer, so the Panel knows to try again", async () => {
    vi.mocked(findLaunchByToken).mockRejectedValue(
      new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
    );

    const res = await chart();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
  });

  it("answers 503 when the indexer stops answering between the launch and the buckets", async () => {
    vi.mocked(findChartBuckets).mockRejectedValue(
      new IndexerUnreachableError(new Error("Connection terminated unexpectedly")),
    );

    expect((await chart()).status).toBe(503);
  });

  describe("the five second cache", () => {
    const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

    it("answers a repeat request within five seconds without reaching the indexer", async () => {
      const first = await chart();
      later(4_900);
      const second = await chart();

      expect(second.body).toEqual(first.body);
      expect(findLaunchByToken).toHaveBeenCalledTimes(1);
      expect(findChartBuckets).toHaveBeenCalledTimes(1);
    });

    it("reads the indexer again once five seconds have passed", async () => {
      await chart();
      later(5_000);
      await chart();

      expect(findChartBuckets).toHaveBeenCalledTimes(2);
    });

    it("holds each response for five seconds, keyed by route, token and range", async () => {
      await chart(token, "?range=6h");

      expect(cacheRedis.setex).toHaveBeenCalledWith(
        `market:v2:chart:${lowercased}:6h`,
        5,
        expect.any(String),
      );
    });

    it("keeps each range apart, so 1d is not served 1h's points", async () => {
      await chart(token, "?range=1h");
      await chart(token, "?range=1d");

      expect(findChartBuckets).toHaveBeenCalledTimes(2);
    });

    it("does not cache a 404 or a 503", async () => {
      vi.mocked(findLaunchByToken)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new IndexerUnreachableError(new Error("down")));

      expect((await chart()).status).toBe(404);
      expect((await chart()).status).toBe(503);
      expect((await chart()).status).toBe(200);
      expect(cacheRedis.setex).toHaveBeenCalledTimes(1);
    });
  });
});
