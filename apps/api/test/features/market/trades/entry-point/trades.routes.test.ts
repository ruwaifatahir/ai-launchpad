import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Only the indexer repos are faked, returning rows shaped the way the SQL in them
// selects. Validation, paging, price and error mapping all run for real, so this is
// the wire contract the Panel reads.
vi.mock("@/features/market/launches/launches.repo", () => ({
  findLaunchByToken: vi.fn(),
}));
vi.mock("@/features/market/trades/trades.repo", () => ({
  countTradesByToken: vi.fn(),
  findTradesByToken: vi.fn(),
}));

import app from "@/app";
import { IndexerUnreachableError } from "@/lib/indexer/client";
import { cacheRedis } from "@/lib/redis/client";
import { useFakeRedis } from "@test/helpers/redis.fake";
import { findLaunchByToken } from "@/features/market/launches/launches.repo";
import {
  type TradeRow,
  countTradesByToken,
  findTradesByToken,
} from "@/features/market/trades/trades.repo";

const token = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
const lowercased = "0xbcd4042de499d14e55001ccbb24a551f3b954096";
const trader = "0xa0cf798816d4b9b9866b5330eea46a18382f251e";
const hash = `0x${"ab".repeat(32)}`;

const launch = {
  curve: `0x${"cc".repeat(20)}`,
  creator: `0x${"dd".repeat(20)}`,
  quoteAddress: "0x0000000000000000000000000000000000000000",
  quoteSymbol: "ETH",
  quoteDecimals: 18,
  supply: "1000000000000000000000000000",
};

const row = (overrides: Partial<TradeRow> = {}): TradeRow => ({
  id: `46630:120:${hash}:3`,
  side: "buy",
  kind: "user",
  venue: "curve",
  trader,
  // Two tokens for half an ether, so the price is 0.25.
  tokenAmount: "2000000000000000000",
  quoteAmount: "500000000000000000",
  timestamp: "1790000000",
  transactionHash: hash,
  ...overrides,
});

const trades = (address = token, query = "") =>
  request(app).get(`/api/v1/market/tokens/${address}/trades${query}`);

describe("GET /api/v1/market/tokens/{token}/trades", () => {
  beforeEach(() => {
    useFakeRedis();
    vi.mocked(findLaunchByToken).mockResolvedValue(launch);
    vi.mocked(countTradesByToken).mockResolvedValue(1);
    vi.mocked(findTradesByToken).mockResolvedValue([row()]);
  });

  it("answers 200 with no credential, because anyone can read a token's page", async () => {
    const res = await trades();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("lets a browser hold a success for the same five seconds the backend does", async () => {
    const res = await trades();

    expect(res.headers["cache-control"]).toBe("public, max-age=5");
  });

  it("never lets a browser hold a 404, so a token the indexer reaches a moment later shows at once", async () => {
    vi.mocked(findLaunchByToken).mockResolvedValue(null);

    const res = await trades();

    expect(res.status).toBe(404);
    expect(res.headers["cache-control"]).toBeUndefined();
  });

  it("carries the decimals and the quote symbol once, beside the page and the total", async () => {
    vi.mocked(countTradesByToken).mockResolvedValue(37);

    const { body } = await trades();

    expect(body.data).toMatchObject({
      tokenDecimals: 18,
      quoteDecimals: 18,
      quoteSymbol: "ETH",
      page: 1,
      pageSize: 10,
      total: 37,
    });
  });

  it("serves each trade with exactly the fields the Panel reads, amounts as raw strings and the price as a number", async () => {
    const [trade] = (await trades()).body.data.trades;

    expect(trade).toEqual({
      id: `46630:120:${hash}:3`,
      side: "buy",
      kind: "user",
      venue: "curve",
      trader,
      tokenAmount: "2000000000000000000",
      quoteAmount: "500000000000000000",
      price: 0.25,
      timestamp: 1790000000,
      transactionHash: hash,
    });
  });

  it("prices each trade in its own decimals, so a six decimal quote asset is not read as eighteen", async () => {
    vi.mocked(findLaunchByToken).mockResolvedValue({
      ...launch,
      quoteSymbol: "USDC",
      quoteDecimals: 6,
    });
    vi.mocked(findTradesByToken).mockResolvedValue([
      row({ tokenAmount: "4000000000000000000", quoteAmount: "3000000" }),
    ]);

    expect((await trades()).body.data.trades[0].price).toBe(0.75);
  });

  it("keeps amounts too large for a float exact, because they travel as strings", async () => {
    const huge = "123456789012345678901234567890";
    vi.mocked(findTradesByToken).mockResolvedValue([row({ tokenAmount: huge })]);

    expect((await trades()).body.data.trades[0].tokenAmount).toBe(huge);
  });

  it("lists buybacks and fee conversions with their kind, so neither reads as a user trading", async () => {
    vi.mocked(findTradesByToken).mockResolvedValue([
      row({ kind: "buyback", venue: "pool" }),
      row({ kind: "fee_conversion", venue: "pool", side: "sell" }),
    ]);

    const kinds = (await trades()).body.data.trades.map(
      (trade: { kind: string }) => trade.kind,
    );

    expect(kinds).toEqual(["buyback", "fee_conversion"]);
  });

  it("serves the trades in the order the indexer returned them, which the query sets newest first", async () => {
    vi.mocked(findTradesByToken).mockResolvedValue([
      row({ id: "newer" }),
      row({ id: "older" }),
    ]);

    const ids = (await trades()).body.data.trades.map(
      (trade: { id: string }) => trade.id,
    );

    expect(ids).toEqual(["newer", "older"]);
  });

  it("reads the first page of ten when no page is asked for", async () => {
    await trades();

    expect(findTradesByToken).toHaveBeenCalledWith(lowercased, { limit: 10, offset: 0 });
  });

  it("reads the last page allowed, a million trades deep", async () => {
    const res = await trades(token, "?page=100000");

    expect(res.status).toBe(200);
    expect(findTradesByToken).toHaveBeenCalledWith(lowercased, {
      limit: 10,
      offset: 999_990,
    });
  });

  it("skips ten trades a page, so page three starts at the twenty first", async () => {
    const res = await trades(token, "?page=3");

    expect(res.body.data.page).toBe(3);
    expect(findTradesByToken).toHaveBeenCalledWith(lowercased, { limit: 10, offset: 20 });
  });

  it("answers a page past the end with no trades and the total, so the Panel can still draw its pager", async () => {
    vi.mocked(countTradesByToken).mockResolvedValue(4);
    vi.mocked(findTradesByToken).mockResolvedValue([]);

    const res = await trades(token, "?page=9");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ trades: [], total: 4 });
  });

  it("reads the lowercased address, so a checksummed and a lowercase address give the same answer", async () => {
    await trades(token);

    expect(findLaunchByToken).toHaveBeenCalledWith(lowercased);
    expect(countTradesByToken).toHaveBeenCalledWith(lowercased);
  });

  it.each([
    ["an address that is not one", "not-an-address", ""],
    ["an address whose capitals break its checksum", token.replace("Bcd", "BCD"), ""],
    ["page zero", token, "?page=0"],
    ["a negative page", token, "?page=-1"],
    ["a fractional page", token, "?page=1.5"],
    ["a page that is not a number", token, "?page=two"],
    ["a page in exponent form", token, "?page=1e1"],
    ["a page in hex", token, "?page=0x2"],
    ["a page with a leading zero", token, "?page=02"],
    ["a page padded with spaces", token, "?page=%203"],
    ["a page past the last one allowed", token, "?page=100001"],
    ["a page sent twice", token, "?page=1&page=2"],
  ])("answers 400 for %s", async (_label, address, query) => {
    const res = await trades(address, query);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(findLaunchByToken).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the indexer holds no launch for, so a typo does not look like a quiet token", async () => {
    vi.mocked(findLaunchByToken).mockResolvedValue(null);

    const res = await trades();

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TOKEN_NOT_FOUND");
    expect(findTradesByToken).not.toHaveBeenCalled();
  });

  it("answers 200 with no trades for a known token nobody has traded yet", async () => {
    vi.mocked(countTradesByToken).mockResolvedValue(0);
    vi.mocked(findTradesByToken).mockResolvedValue([]);

    const res = await trades();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ trades: [], total: 0 });
  });

  it("answers 503 when the indexer does not answer, so the Panel knows to try again", async () => {
    vi.mocked(findLaunchByToken).mockRejectedValue(
      new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
    );

    const res = await trades();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
  });

  it("answers 503 when the indexer stops answering between the launch and the trades", async () => {
    vi.mocked(findTradesByToken).mockRejectedValue(
      new IndexerUnreachableError(new Error("Connection terminated unexpectedly")),
    );

    expect((await trades()).status).toBe(503);
  });

  it("answers a plain 500 for any other indexer failure, such as a renamed column, because that one is ours", async () => {
    vi.mocked(findTradesByToken).mockRejectedValue(
      new Error('column "quote_amount" does not exist'),
    );

    const res = await trades();

    expect(res.status).toBe(500);
    expect(res.body.message).not.toContain("quote_amount");
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
      const first = await trades();
      later(4_900);
      const second = await trades();

      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(findLaunchByToken).toHaveBeenCalledTimes(1);
      expect(countTradesByToken).toHaveBeenCalledTimes(1);
      expect(findTradesByToken).toHaveBeenCalledTimes(1);
    });

    it("reads the indexer again once five seconds have passed", async () => {
      await trades();
      later(5_000);
      vi.mocked(countTradesByToken).mockResolvedValue(2);

      const res = await trades();

      expect(res.body.data.total).toBe(2);
      expect(findTradesByToken).toHaveBeenCalledTimes(2);
    });

    it("holds each response for five seconds, keyed by route, token and page", async () => {
      await trades(token, "?page=2");

      expect(cacheRedis.setex).toHaveBeenCalledWith(
        `market:v2:trades:${lowercased}:2`,
        5,
        expect.any(String),
      );
    });

    it("keeps each page apart, so page two is not served page one's trades", async () => {
      await trades(token, "?page=1");
      await trades(token, "?page=2");

      expect(findTradesByToken).toHaveBeenCalledTimes(2);
      expect(findTradesByToken).toHaveBeenLastCalledWith(lowercased, {
        limit: 10,
        offset: 10,
      });
    });

    it("keeps each token apart, so one token is not served another's trades", async () => {
      await trades(token);
      await trades(trader);

      expect(findLaunchByToken).toHaveBeenCalledTimes(2);
      expect(findLaunchByToken).toHaveBeenLastCalledWith(trader);
    });

    it("shares one entry between a checksummed and a lowercase address", async () => {
      await trades(token);
      await trades(lowercased);

      expect(findLaunchByToken).toHaveBeenCalledTimes(1);
    });

    it("does not cache a 404, so a token the indexer reaches a moment later is served at once", async () => {
      vi.mocked(findLaunchByToken).mockResolvedValueOnce(null);

      expect((await trades()).status).toBe(404);
      expect((await trades()).status).toBe(200);
      expect(cacheRedis.setex).toHaveBeenCalledTimes(1);
    });

    it("does not cache a 503, so the next poll tries the indexer again", async () => {
      vi.mocked(findLaunchByToken).mockRejectedValueOnce(
        new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
      );

      expect((await trades()).status).toBe(503);
      expect((await trades()).status).toBe(200);
      expect(cacheRedis.setex).toHaveBeenCalledTimes(1);
    });

    it("reads the indexer once for requests that arrive together on an empty cache", async () => {
      const responses = await Promise.all([trades(), trades(), trades()]);

      expect(responses.map((res) => res.status)).toEqual([200, 200, 200]);
      expect(findTradesByToken).toHaveBeenCalledTimes(1);
    });

    it("still answers from the indexer when Redis fails, because the cache only saves load", async () => {
      vi.mocked(cacheRedis.get).mockRejectedValue(new Error("ECONNRESET"));
      vi.mocked(cacheRedis.setex).mockRejectedValue(new Error("ECONNRESET"));

      const res = await trades();

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
    });

    it("reads the indexer past a cache read that timed out, and never waits on the write", async () => {
      vi.mocked(cacheRedis.get).mockRejectedValue(new Error("Command timed out"));
      vi.mocked(cacheRedis.setex).mockReturnValue(new Promise(() => {}) as never);

      const res = await trades();

      expect(res.status).toBe(200);
      expect(findTradesByToken).toHaveBeenCalledTimes(1);
    });

    it("reads the indexer past an entry that is not JSON, rather than answering 500", async () => {
      vi.mocked(cacheRedis.get).mockResolvedValue("{not json");

      const res = await trades();

      expect(res.status).toBe(200);
      expect(findTradesByToken).toHaveBeenCalledTimes(1);
    });
  });
});
