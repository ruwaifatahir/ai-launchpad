import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Only the indexer repos are faked, returning rows shaped the way the SQL in them
// selects. Validation, paging, labels, shares and error mapping all run for real, so
// this is the wire contract the Panel reads.
vi.mock("@/features/market/launches/launches.repo", () => ({
  findLaunchByToken: vi.fn(),
}));
vi.mock("@/features/market/holders/holders.repo", () => ({
  countHoldersByToken: vi.fn(),
  findHoldersByToken: vi.fn(),
}));

import app from "@/app";
import { IndexerUnreachableError } from "@/lib/indexer/client";
import { cacheRedis } from "@/lib/redis/client";
import { useFakeRedis } from "@test/helpers/redis.fake";
import { TEST_ENV } from "@test/helpers/env.mock";
import { findLaunchByToken } from "@/features/market/launches/launches.repo";
import {
  type HolderRow,
  countHoldersByToken,
  findHoldersByToken,
} from "@/features/market/holders/holders.repo";

const token = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
const lowercased = "0xbcd4042de499d14e55001ccbb24a551f3b954096";

const curve = `0x${"cc".repeat(20)}`;
const creator = `0x${"dd".repeat(20)}`;
const someone = `0x${"ee".repeat(20)}`;

// A billion tokens, so one million is a tenth of a percent.
const SUPPLY = "1000000000000000000000000000";
const MILLION = "1000000000000000000000000";

const launch = {
  curve,
  creator,
  quoteAddress: "0x0000000000000000000000000000000000000000",
  quoteSymbol: "ETH",
  quoteDecimals: 18,
  supply: SUPPLY,
};

const row = (wallet: string, balance = MILLION): HolderRow => ({ wallet, balance });

const holders = (address = token, query = "") =>
  request(app).get(`/api/v1/market/tokens/${address}/holders${query}`);

describe("GET /api/v1/market/tokens/{token}/holders", () => {
  beforeEach(() => {
    useFakeRedis();
    vi.mocked(findLaunchByToken).mockResolvedValue(launch);
    vi.mocked(countHoldersByToken).mockResolvedValue({ total: 1, holderCount: 1 });
    vi.mocked(findHoldersByToken).mockResolvedValue([row(someone)]);
  });

  it("answers 200 with no credential, because anyone can read a token's page", async () => {
    const res = await holders();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("lets a browser hold a success for the same five seconds the backend does", async () => {
    const res = await holders();

    expect(res.headers["cache-control"]).toBe("public, max-age=5");
  });

  it("never lets a browser hold a 404, so a token the indexer reaches a moment later shows at once", async () => {
    vi.mocked(findLaunchByToken).mockResolvedValue(null);

    const res = await holders();

    expect(res.status).toBe(404);
    expect(res.headers["cache-control"]).toBeUndefined();
  });

  it("carries the supply, the page, the total and the holder count beside the holders", async () => {
    vi.mocked(countHoldersByToken).mockResolvedValue({ total: 23, holderCount: 17 });

    const { body } = await holders();

    expect(body.data).toMatchObject({
      tokenDecimals: 18,
      supply: SUPPLY,
      page: 1,
      pageSize: 10,
      total: 23,
      holderCount: 17,
    });
  });

  it("serves each holder with exactly the fields the Panel reads, the balance raw and the share a percent", async () => {
    const [holder] = (await holders()).body.data.holders;

    expect(holder).toEqual({
      wallet: someone,
      balance: MILLION,
      share: 0.1,
      label: null,
    });
  });

  it("works the share out without losing a balance too large for a float", async () => {
    // A third of the supply, whose digits run past what a float holds.
    const third = "333333333333333333333333333";
    vi.mocked(findHoldersByToken).mockResolvedValue([row(someone, third)]);

    const [holder] = (await holders()).body.data.holders;

    expect(holder.balance).toBe(third);
    expect(holder.share).toBeCloseTo(33.333333333333, 10);
  });

  it("measures the share against the current supply, so burned tokens count for no one", async () => {
    vi.mocked(findLaunchByToken).mockResolvedValue({
      ...launch,
      supply: "500000000000000000000000000",
    });

    expect((await holders()).body.data.holders[0].share).toBe(0.2);
  });

  it("serves the holders in the order the indexer returned them, which the query sets largest first", async () => {
    vi.mocked(findHoldersByToken).mockResolvedValue([
      row(creator, "3"),
      row(someone, "2"),
    ]);

    const wallets = (await holders()).body.data.holders.map(
      (holder: { wallet: string }) => holder.wallet,
    );

    expect(wallets).toEqual([creator, someone]);
  });

  it.each([
    ["bonding_curve", "the token's own curve", curve],
    ["uniswap_pool", "Uniswap's PoolManager", TEST_ENV.POOL_MANAGER_ADDRESS as string],
    ["locker", "the launch locker", TEST_ENV.LOCKER_ADDRESS as string],
    ["buyback_vault", "the buyback vault", TEST_ENV.BUYBACK_VAULT_ADDRESS as string],
    ["hook", "the launchpad's hook", TEST_ENV.HOOK_ADDRESS as string],
    ["burn_address", "0x...dEaD", "0x000000000000000000000000000000000000dead"],
    ["creator", "the token's creator", creator],
  ])("labels %s on %s", async (label, _what, wallet) => {
    vi.mocked(findHoldersByToken).mockResolvedValue([row(wallet)]);

    expect((await holders()).body.data.holders[0].label).toBe(label);
  });

  it("labels another token's curve as no one, because only this token's curve is its curve", async () => {
    vi.mocked(findLaunchByToken).mockResolvedValue({
      ...launch,
      curve: `0x${"c1".repeat(20)}`,
    });
    vi.mocked(findHoldersByToken).mockResolvedValue([row(curve)]);

    expect((await holders()).body.data.holders[0].label).toBeNull();
  });

  it("labels a creator who is also the curve as the curve, so a contract never reads as a person", async () => {
    vi.mocked(findLaunchByToken).mockResolvedValue({ ...launch, creator: curve });
    vi.mocked(findHoldersByToken).mockResolvedValue([row(curve)]);

    expect((await holders()).body.data.holders[0].label).toBe("bonding_curve");
  });

  it("reads the first page of ten when no page is asked for", async () => {
    await holders();

    expect(findHoldersByToken).toHaveBeenCalledWith(lowercased, { limit: 10, offset: 0 });
  });

  it("skips ten holders a page, so page three starts at the twenty first", async () => {
    const res = await holders(token, "?page=3");

    expect(res.body.data.page).toBe(3);
    expect(findHoldersByToken).toHaveBeenCalledWith(lowercased, {
      limit: 10,
      offset: 20,
    });
  });

  it("answers a page past the end with no holders and the total, so the Panel can still draw its pager", async () => {
    vi.mocked(countHoldersByToken).mockResolvedValue({ total: 4, holderCount: 2 });
    vi.mocked(findHoldersByToken).mockResolvedValue([]);

    const res = await holders(token, "?page=9");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ holders: [], total: 4, holderCount: 2 });
  });

  it("reads the lowercased address, so a checksummed and a lowercase address give the same answer", async () => {
    await holders(token);

    expect(findLaunchByToken).toHaveBeenCalledWith(lowercased);
    expect(countHoldersByToken).toHaveBeenCalledWith(lowercased);
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
    const res = await holders(address, query);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(findLaunchByToken).not.toHaveBeenCalled();
  });

  it("answers 404 for a token the indexer holds no launch for, so a typo does not look like a quiet token", async () => {
    vi.mocked(findLaunchByToken).mockResolvedValue(null);

    const res = await holders();

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TOKEN_NOT_FOUND");
    expect(findHoldersByToken).not.toHaveBeenCalled();
  });

  it("answers 200 with no holders for a known token nobody holds yet", async () => {
    vi.mocked(countHoldersByToken).mockResolvedValue({ total: 0, holderCount: 0 });
    vi.mocked(findHoldersByToken).mockResolvedValue([]);

    const res = await holders();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ holders: [], total: 0, holderCount: 0 });
  });

  it("answers 503 when the indexer does not answer, so the Panel knows to try again", async () => {
    vi.mocked(findLaunchByToken).mockRejectedValue(
      new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
    );

    const res = await holders();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
  });

  it("answers 503 when the indexer stops answering between the launch and the holders", async () => {
    vi.mocked(findHoldersByToken).mockRejectedValue(
      new IndexerUnreachableError(new Error("Connection terminated unexpectedly")),
    );

    expect((await holders()).status).toBe(503);
  });

  it("answers a plain 500 for any other indexer failure, such as a renamed column, because that one is ours", async () => {
    vi.mocked(findHoldersByToken).mockRejectedValue(
      new Error('column "is_protocol" does not exist'),
    );

    const res = await holders();

    expect(res.status).toBe(500);
    expect(res.body.message).not.toContain("is_protocol");
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
      const first = await holders();
      later(4_900);
      const second = await holders();

      expect(second.body).toEqual(first.body);
      expect(findLaunchByToken).toHaveBeenCalledTimes(1);
      expect(countHoldersByToken).toHaveBeenCalledTimes(1);
      expect(findHoldersByToken).toHaveBeenCalledTimes(1);
    });

    it("reads the indexer again once five seconds have passed", async () => {
      await holders();
      later(5_000);
      vi.mocked(countHoldersByToken).mockResolvedValue({ total: 2, holderCount: 2 });

      const res = await holders();

      expect(res.body.data.holderCount).toBe(2);
      expect(findHoldersByToken).toHaveBeenCalledTimes(2);
    });

    it("holds each response for five seconds, keyed by route, token and page", async () => {
      await holders(token, "?page=2");

      expect(cacheRedis.setex).toHaveBeenCalledWith(
        `market:v2:holders:${lowercased}:2`,
        5,
        expect.any(String),
      );
    });

    it("does not cache a 404, so a token the indexer reaches a moment later is served at once", async () => {
      vi.mocked(findLaunchByToken).mockResolvedValueOnce(null);

      expect((await holders()).status).toBe(404);
      expect((await holders()).status).toBe(200);
      expect(cacheRedis.setex).toHaveBeenCalledTimes(1);
    });

    it("does not cache a 503, so the next poll tries the indexer again", async () => {
      vi.mocked(findLaunchByToken).mockRejectedValueOnce(
        new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
      );

      expect((await holders()).status).toBe(503);
      expect((await holders()).status).toBe(200);
      expect(cacheRedis.setex).toHaveBeenCalledTimes(1);
    });
  });
});
