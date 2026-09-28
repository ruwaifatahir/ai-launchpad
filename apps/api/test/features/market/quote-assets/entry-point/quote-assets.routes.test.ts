import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Only the indexer repo is faked, returning rows shaped the way its SQL selects them.
// Error mapping and the cache run for real, so this is the wire contract the Panel's
// Pair filter reads.
vi.mock("@/features/market/quote-assets/quote-assets.repo", () => ({
  findQuoteAssets: vi.fn(),
}));

import app from "@/app";
import { IndexerUnreachableError } from "@/lib/indexer/client";
import { cacheRedis } from "@/lib/redis/client";
import { useFakeRedis } from "@test/helpers/redis.fake";
import { findQuoteAssets } from "@/features/market/quote-assets/quote-assets.repo";

const ETH = {
  address: "0x0000000000000000000000000000000000000000",
  symbol: "ETH",
  decimals: 18,
};
const NVDA = { address: `0x${"c1".repeat(20)}`, symbol: "NVDA", decimals: 6 };
const NVDA_TWIN = { address: `0x${"c2".repeat(20)}`, symbol: "NVDA", decimals: 18 };

const quoteAssets = () => request(app).get("/api/v1/market/quote-assets");

describe("GET /api/v1/market/quote-assets", () => {
  beforeEach(() => {
    useFakeRedis();
    vi.mocked(findQuoteAssets).mockResolvedValue([ETH, NVDA, NVDA_TWIN]);
  });

  it("answers 200 with no credential, because anyone can search", async () => {
    const res = await quoteAssets();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("lets a browser hold a success for the same five seconds the backend does", async () => {
    expect((await quoteAssets()).headers["cache-control"]).toBe("public, max-age=5");
  });

  it("serves each quote asset with exactly its address, symbol and decimals, in the order the query sets", async () => {
    expect((await quoteAssets()).body.data).toEqual({
      quoteAssets: [ETH, NVDA, NVDA_TWIN],
    });
  });

  it("serves native ETH as the zero address with the symbol ETH", async () => {
    const [first] = (await quoteAssets()).body.data.quoteAssets;

    expect(first).toEqual(ETH);
  });

  it("lists two quote assets sharing a symbol separately, since only the address tells them apart", async () => {
    const nvdas = (await quoteAssets()).body.data.quoteAssets.filter(
      (asset: { symbol: string }) => asset.symbol === "NVDA",
    );

    expect(nvdas).toEqual([NVDA, NVDA_TWIN]);
  });

  it("answers an empty list before any token has launched", async () => {
    vi.mocked(findQuoteAssets).mockResolvedValue([]);

    const res = await quoteAssets();

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ quoteAssets: [] });
  });

  it("answers 503 when the indexer does not answer, so the Panel knows to try again", async () => {
    vi.mocked(findQuoteAssets).mockRejectedValue(
      new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
    );

    const res = await quoteAssets();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
    expect(res.headers["cache-control"]).toBeUndefined();
  });

  it("answers a plain 500 for any other indexer failure, such as a renamed column, because that one is ours", async () => {
    vi.mocked(findQuoteAssets).mockRejectedValue(
      new Error('column "quote_asset_symbol" does not exist'),
    );

    const res = await quoteAssets();

    expect(res.status).toBe(500);
    expect(res.body.message).not.toContain("quote_asset_symbol");
  });

  describe("the five second cache", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

    it("answers a repeat request within five seconds without reaching the indexer", async () => {
      const first = await quoteAssets();
      later(4_900);
      const second = await quoteAssets();

      expect(second.body).toEqual(first.body);
      expect(findQuoteAssets).toHaveBeenCalledTimes(1);
    });

    it("reads the indexer again once five seconds have passed", async () => {
      await quoteAssets();
      later(5_000);
      vi.mocked(findQuoteAssets).mockResolvedValue([ETH]);

      const res = await quoteAssets();

      expect(res.body.data.quoteAssets).toEqual([ETH]);
      expect(findQuoteAssets).toHaveBeenCalledTimes(2);
    });

    it("holds the list for five seconds under one key, since the route takes no query", async () => {
      await quoteAssets();

      expect(cacheRedis.setex).toHaveBeenCalledWith(
        "market:v2:quote-assets",
        5,
        expect.any(String),
      );
    });

    it("ignores a query string, so a cache busting parameter cannot bypass the cache", async () => {
      await quoteAssets();
      await request(app).get("/api/v1/market/quote-assets?bust=1");

      expect(findQuoteAssets).toHaveBeenCalledTimes(1);
    });

    it("does not cache a 503, so the next poll tries the indexer again", async () => {
      vi.mocked(findQuoteAssets).mockRejectedValueOnce(
        new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
      );

      expect((await quoteAssets()).status).toBe(503);
      expect((await quoteAssets()).status).toBe(200);
      expect(cacheRedis.setex).toHaveBeenCalledTimes(1);
    });
  });
});
