import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Only the indexer repo is faked, returning rows shaped the way its SQL selects them.
// Validation, paging, the item shape, progress and error mapping all run for real, so
// this is the wire contract the Panel reads.
vi.mock("@/features/market/tokens/tokens.repo", () => ({
  countLaunches: vi.fn(),
  countListedLaunches: vi.fn(),
  findListedLaunches: vi.fn(),
}));

// Dollar rates are read from Chainlink, which a route test never reaches. The reading
// itself is proved in test/features/market/dollar-rates.
vi.mock("@/features/market/dollar-rates/reading", () => ({ readDollarRates: vi.fn() }));

import app from "@/app";
import { IndexerBusyError, IndexerUnreachableError } from "@/lib/indexer/client";
import { cacheRedis } from "@/lib/redis/client";
import { useFakeRedis } from "@test/helpers/redis.fake";
import { readDollarRates } from "@/features/market/dollar-rates/reading";
import {
  type ListedLaunchRow,
  countLaunches,
  countListedLaunches,
  findListedLaunches,
} from "@/features/market/tokens/tokens.repo";

const token = `0x${"a1".repeat(20)}`;
const other = `0x${"a2".repeat(20)}`;
const creator = `0x${"dd".repeat(20)}`;
const nvda = `0x${"c1".repeat(20)}`;

// What readDollarRates holds with the switch off. Each test that wants rates sets its own.
const NO_RATES = new Map<string, number>();
const RATES = new Map([[nvda, 225.66]]);

beforeEach(() => {
  vi.mocked(readDollarRates).mockResolvedValue(NO_RATES);
});

// Holds the rates back until the list has asked for its count, so a list that waited
// on the rates before counting never answers and the test times out.
const ratesAfterTheCount = () => {
  let counted!: () => void;
  const gate = new Promise<void>((resolve) => {
    counted = resolve;
  });
  vi.mocked(countListedLaunches).mockImplementation(async () => {
    counted();
    return 1;
  });
  vi.mocked(readDollarRates).mockImplementation(() => gate.then(() => RATES));
};

const row = (overrides: Partial<ListedLaunchRow> = {}): ListedLaunchRow => ({
  token,
  name: "Graduate",
  symbol: "GRAD",
  logo: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  creator,
  marketCap: "123456789012345678901234567890",
  quoteAddress: nvda,
  quoteSymbol: "NVDA",
  quoteDecimals: 6,
  curveQuoteReserve: "5000000",
  graduationThreshold: "5000000",
  graduated: true,
  launchedAt: 1790000000,
  lastBuyAt: 1790000500,
  ...overrides,
});

const graduated = (query = "") =>
  request(app).get(`/api/v1/market/tokens/graduated${query}`);

describe("GET /api/v1/market/tokens/graduated", () => {
  beforeEach(() => {
    useFakeRedis();
    vi.mocked(countListedLaunches).mockResolvedValue(1);
    vi.mocked(findListedLaunches).mockResolvedValue([row()]);
  });

  it("answers 200 with no credential, because anyone can explore", async () => {
    const res = await graduated();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("lets a browser hold a success for the same five seconds the backend does", async () => {
    const res = await graduated();

    expect(res.headers["cache-control"]).toBe("public, max-age=5");
  });

  it("carries the page, the page size and the number of graduated tokens beside the tokens", async () => {
    vi.mocked(countListedLaunches).mockResolvedValue(37);

    const { body } = await graduated();

    expect(body.data).toMatchObject({ page: 1, pageSize: 10, total: 37 });
  });

  it("serves each token with exactly the fields the Panel reads, amounts raw and no FDV", async () => {
    const [item] = (await graduated()).body.data.tokens;

    expect(item).toEqual({
      token,
      name: "Graduate",
      symbol: "GRAD",
      logo: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      creator,
      marketCap: "123456789012345678901234567890",
      quoteAsset: { address: nvda, symbol: "NVDA", decimals: 6 },
      quoteUsd: null,
      progress: 100,
      graduated: true,
      launchedAt: 1790000000,
      lastBuyAt: 1790000500,
    });
  });

  it("counts while the dollar rates are read, so a slow feed never delays the count", async () => {
    ratesAfterTheCount();

    const res = await graduated();

    expect(res.status).toBe(200);
    expect(res.body.data.tokens[0].quoteUsd).toBe(225.66);
  });

  it("serves each token's dollar rate beside its quote asset", async () => {
    vi.mocked(readDollarRates).mockResolvedValue(RATES);

    expect((await graduated()).body.data.tokens[0].quoteUsd).toBe(225.66);
  });

  it("serves a null dollar rate for a token whose quote asset has none", async () => {
    vi.mocked(readDollarRates).mockResolvedValue(new Map([[other, 2691.3]]));

    expect((await graduated()).body.data.tokens[0].quoteUsd).toBeNull();
  });

  it("hands the dollar rates to the list, so it ranks by market cap in dollars", async () => {
    vi.mocked(readDollarRates).mockResolvedValue(RATES);

    await graduated();

    expect(findListedLaunches).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      RATES,
    );
  });

  it.each([
    ["an https link", "https://example.com/logo.png"],
    ["an empty logo", ""],
    ["anything else the creator set", "not a link at all"],
  ])("passes %s through exactly as the indexer holds it", async (_label, logo) => {
    vi.mocked(findListedLaunches).mockResolvedValue([row({ logo })]);

    expect((await graduated()).body.data.tokens[0].logo).toBe(logo);
  });

  it("serves a null last buy for a token nobody has bought", async () => {
    vi.mocked(findListedLaunches).mockResolvedValue([row({ lastBuyAt: null })]);

    expect((await graduated()).body.data.tokens[0].lastBuyAt).toBeNull();
  });

  it("reads progress as 100 once graduated, whatever the frozen curve holds", async () => {
    vi.mocked(findListedLaunches).mockResolvedValue([
      row({ curveQuoteReserve: "4999999" }),
    ]);

    expect((await graduated()).body.data.tokens[0].progress).toBe(100);
  });

  it("serves the tokens in the order the indexer returned them, which the query sets largest first", async () => {
    vi.mocked(findListedLaunches).mockResolvedValue([
      row({ token: other }),
      row({ token }),
    ]);

    const tokens = (await graduated()).body.data.tokens.map(
      (item: { token: string }) => item.token,
    );

    expect(tokens).toEqual([other, token]);
  });

  it("reads the first page of ten when no page or size is asked for", async () => {
    await graduated();

    expect(findListedLaunches).toHaveBeenCalledWith(
      {
        sort: "market-cap",
        since: null,
        graduated: true,
        q: "",
        quote: null,
        creator: null,
      },
      { limit: 10, offset: 0 },
      NO_RATES,
    );
    expect(countListedLaunches).toHaveBeenCalledWith({
      sort: "market-cap",
      since: null,
      graduated: true,
      q: "",
      quote: null,
      creator: null,
    });
  });

  it.each([6, 10, 20, 24, 50])("reads pages of %i when asked", async (size) => {
    const res = await graduated(`?page=3&pageSize=${size}`);

    expect(res.body.data).toMatchObject({ page: 3, pageSize: size });
    expect(findListedLaunches).toHaveBeenCalledWith(
      expect.anything(),
      {
        limit: size,
        offset: 2 * size,
      },
      NO_RATES,
    );
  });

  it("answers a page past the end with no tokens and the total, so the Panel can still draw its pager", async () => {
    vi.mocked(countListedLaunches).mockResolvedValue(4);
    vi.mocked(findListedLaunches).mockResolvedValue([]);

    const res = await graduated("?page=9");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokens: [], total: 4 });
  });

  it.each([
    ["page zero", "?page=0"],
    ["a negative page", "?page=-1"],
    ["a fractional page", "?page=1.5"],
    ["a page that is not a number", "?page=two"],
    ["a page in exponent form", "?page=1e1"],
    ["a page with a leading zero", "?page=02"],
    ["a page past the last one allowed", "?page=100001"],
    ["a page sent twice", "?page=1&page=2"],
    ["a page size outside the set", "?pageSize=12"],
    ["a page size of zero", "?pageSize=0"],
    ["a page size with a leading zero", "?pageSize=010"],
    ["a page size padded with spaces", "?pageSize=%2010"],
    ["an empty page size", "?pageSize="],
    ["a page size sent twice", "?pageSize=10&pageSize=20"],
  ])("answers 400 for %s", async (_label, query) => {
    const res = await graduated(query);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(findListedLaunches).not.toHaveBeenCalled();
  });

  it("answers 503 when the indexer does not answer, so the Panel knows to try again", async () => {
    vi.mocked(countListedLaunches).mockRejectedValue(
      new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
    );

    const res = await graduated();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
    expect(res.headers["cache-control"]).toBeUndefined();
  });

  it("answers a plain 500 for any other indexer failure, such as a renamed column, because that one is ours", async () => {
    vi.mocked(findListedLaunches).mockRejectedValue(
      new Error('column "market_cap" does not exist'),
    );

    const res = await graduated();

    expect(res.status).toBe(500);
    expect(res.body.message).not.toContain("market_cap");
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
      const first = await graduated();
      later(4_900);
      const second = await graduated();

      expect(second.body).toEqual(first.body);
      expect(countListedLaunches).toHaveBeenCalledTimes(1);
      expect(findListedLaunches).toHaveBeenCalledTimes(1);
    });

    it("reads the indexer again once five seconds have passed", async () => {
      await graduated();
      later(5_000);
      vi.mocked(countListedLaunches).mockResolvedValue(2);

      const res = await graduated();

      expect(res.body.data.total).toBe(2);
      expect(findListedLaunches).toHaveBeenCalledTimes(2);
    });

    it("holds each response for five seconds, keyed by route, page and page size", async () => {
      await graduated("?page=2&pageSize=24");

      expect(cacheRedis.setex).toHaveBeenCalledWith(
        "market:v2:graduated:page=2&pageSize=24",
        5,
        expect.any(String),
      );
    });

    it("keys the defaults as written out, so an empty query and its explicit twin share one entry", async () => {
      await graduated();
      await graduated("?page=1&pageSize=10");

      expect(cacheRedis.setex).toHaveBeenCalledTimes(1);
      expect(cacheRedis.setex).toHaveBeenCalledWith(
        "market:v2:graduated:page=1&pageSize=10",
        5,
        expect.any(String),
      );
    });

    it("keeps each page size apart, so a grid of six never answers a grid of fifty", async () => {
      await graduated("?pageSize=6");
      await graduated("?pageSize=50");

      expect(findListedLaunches).toHaveBeenCalledTimes(2);
    });

    it("does not cache a 503, so the next poll tries the indexer again", async () => {
      vi.mocked(countListedLaunches).mockRejectedValueOnce(
        new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
      );

      expect((await graduated()).status).toBe(503);
      expect((await graduated()).status).toBe(200);
      expect(cacheRedis.setex).toHaveBeenCalledTimes(1);
    });
  });
});

const explore = (query = "") => request(app).get(`/api/v1/market/tokens/explore${query}`);

// A token still on its curve, 40% of the way to graduation.
const curveRow = (overrides: Partial<ListedLaunchRow> = {}) =>
  row({
    name: "Climber",
    symbol: "CLMB",
    curveQuoteReserve: "2000000",
    graduated: false,
    ...overrides,
  });

const NOW = 1_790_000_000;
const DAY = 86_400;

describe("GET /api/v1/market/tokens/explore", () => {
  beforeEach(() => {
    useFakeRedis();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW * 1000);
    vi.mocked(countListedLaunches).mockResolvedValue(1);
    vi.mocked(countLaunches).mockResolvedValue(1);
    vi.mocked(findListedLaunches).mockResolvedValue([curveRow()]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts while the dollar rates are read, so a slow feed never delays the count", async () => {
    ratesAfterTheCount();

    const res = await explore();

    expect(res.status).toBe(200);
    expect(res.body.data.tokens[0].quoteUsd).toBe(225.66);
  });

  it("serves each token's dollar rate, and hands the rates to the list, so it sorts in dollars", async () => {
    vi.mocked(readDollarRates).mockResolvedValue(RATES);

    const { body } = await explore();

    expect(body.data.tokens[0].quoteUsd).toBe(225.66);
    expect(findListedLaunches).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      RATES,
    );
  });

  it("answers 200 with no credential, because anyone can explore", async () => {
    const res = await explore();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers["cache-control"]).toBe("public, max-age=5");
  });

  it("sorts by recent buys over every age, fifty a page, when nothing is asked for", async () => {
    const { body } = await explore();

    expect(body.data).toMatchObject({
      sort: "recent-buys",
      age: "all",
      page: 1,
      pageSize: 50,
    });
    expect(findListedLaunches).toHaveBeenCalledWith(
      {
        sort: "recent-buys",
        since: null,
        graduated: false,
        q: "",
        quote: null,
        creator: null,
      },
      { limit: 50, offset: 0 },
      NO_RATES,
    );
    expect(countListedLaunches).toHaveBeenCalledWith({
      sort: "recent-buys",
      since: null,
      graduated: false,
      q: "",
      quote: null,
      creator: null,
    });
  });

  it("carries the tokens matching the sort and age, and every token ever launched", async () => {
    vi.mocked(countListedLaunches).mockResolvedValue(12);
    vi.mocked(countLaunches).mockResolvedValue(340);

    const { body } = await explore("?age=24h");

    expect(body.data).toMatchObject({ total: 12, launched: 340 });
  });

  it("serves each token with the same fields as every list, progress read off the curve", async () => {
    const [item] = (await explore()).body.data.tokens;

    expect(item).toEqual({
      token,
      name: "Climber",
      symbol: "CLMB",
      logo: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      creator,
      marketCap: "123456789012345678901234567890",
      quoteAsset: { address: nvda, symbol: "NVDA", decimals: 6 },
      quoteUsd: null,
      progress: 40,
      graduated: false,
      launchedAt: 1790000000,
      lastBuyAt: 1790000500,
    });
  });

  it("caps progress at 100 for a token whose curve closed past its threshold before its pool opened", async () => {
    vi.mocked(findListedLaunches).mockResolvedValue([
      curveRow({ curveQuoteReserve: "5000001" }),
    ]);

    expect((await explore()).body.data.tokens[0].progress).toBe(100);
  });

  const AGES: [string, number | null][] = [
    ["all", null],
    ["24h", NOW - DAY],
    ["7d", NOW - 7 * DAY],
  ];

  it.each(
    ["recent-buys", "newest", "oldest", "market-cap"].flatMap((sort) =>
      AGES.map(([age, since]) => [sort, age, since] as const),
    ),
  )("reads %s over %s, the age reaching back from now", async (sort, age, since) => {
    const res = await explore(`?sort=${sort}&age=${age}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ sort, age });
    const filter = { sort, since, graduated: false, q: "", quote: null, creator: null };
    expect(findListedLaunches).toHaveBeenCalledWith(filter, expect.anything(), NO_RATES);
    expect(countListedLaunches).toHaveBeenCalledWith(filter);
  });

  it.each(AGES)(
    "reads volume over %s, the window reaching back from now",
    async (age, since) => {
      const res = await explore(`?sort=volume&age=${age}&page=2&pageSize=6`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ sort: "volume", age });
      const filter = {
        sort: "volume",
        since,
        graduated: false,
        q: "",
        quote: null,
        creator: null,
      };
      expect(findListedLaunches).toHaveBeenCalledWith(
        filter,
        { limit: 6, offset: 6 },
        NO_RATES,
      );
      expect(countListedLaunches).toHaveBeenCalledWith(filter);
    },
  );

  it("serves each token's volume for the window under the volume sort, as a raw integer string", async () => {
    vi.mocked(countListedLaunches).mockResolvedValue(21);
    vi.mocked(countLaunches).mockResolvedValue(340);
    vi.mocked(findListedLaunches).mockResolvedValue([
      { ...curveRow(), volume: "98765432109876543210987654321" },
    ]);

    const { body } = await explore("?sort=volume&age=24h");

    expect(body.data).toMatchObject({ total: 21, launched: 340 });
    expect(body.data.tokens[0]).toEqual({
      token,
      name: "Climber",
      symbol: "CLMB",
      logo: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      creator,
      marketCap: "123456789012345678901234567890",
      quoteAsset: { address: nvda, symbol: "NVDA", decimals: 6 },
      quoteUsd: null,
      progress: 40,
      graduated: false,
      launchedAt: 1790000000,
      lastBuyAt: 1790000500,
      volume: "98765432109876543210987654321",
    });
  });

  it.each(["recent-buys", "newest", "oldest", "market-cap"])(
    "serves no volume under %s",
    async (sort) => {
      const [item] = (await explore(`?sort=${sort}`)).body.data.tokens;

      expect(item).not.toHaveProperty("volume");
    },
  );

  it.each([6, 10, 20, 24, 50])("reads pages of %i when asked", async (size) => {
    await explore(`?page=2&pageSize=${size}`);

    expect(findListedLaunches).toHaveBeenCalledWith(
      expect.anything(),
      {
        limit: size,
        offset: size,
      },
      NO_RATES,
    );
  });

  it("answers a page past the end with no tokens and both totals", async () => {
    vi.mocked(countListedLaunches).mockResolvedValue(3);
    vi.mocked(countLaunches).mockResolvedValue(9);
    vi.mocked(findListedLaunches).mockResolvedValue([]);

    const res = await explore("?page=4");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokens: [], total: 3, launched: 9 });
  });

  it.each([
    ["an unknown sort", "?sort=hot"],
    ["a sort in capitals", "?sort=NEWEST"],
    ["an empty sort", "?sort="],
    ["a sort sent twice", "?sort=newest&sort=oldest"],
    ["an unknown age", "?age=1h"],
    ["an age in capitals", "?age=24H"],
    ["an empty age", "?age="],
    ["an age sent twice", "?age=24h&age=7d"],
    ["page zero", "?page=0"],
    ["a page in exponent form", "?page=1e1"],
    ["a page past the last one allowed", "?page=100001"],
    ["a page size outside the set", "?pageSize=12"],
    ["a page size sent twice", "?pageSize=10&pageSize=20"],
  ])("answers 400 for %s", async (_label, query) => {
    const res = await explore(query);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(findListedLaunches).not.toHaveBeenCalled();
  });

  it("answers 503 when the indexer does not answer, and holds nothing, so the next poll asks again", async () => {
    vi.mocked(countLaunches).mockRejectedValueOnce(
      new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
    );

    const res = await explore();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
    expect(res.headers["cache-control"]).toBeUndefined();
    expect((await explore()).status).toBe(200);
  });

  describe("the five second cache", () => {
    const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

    it("answers a repeat request within five seconds without reaching the indexer", async () => {
      const first = await explore();
      later(4_900);
      const second = await explore();

      expect(second.body).toEqual(first.body);
      expect(findListedLaunches).toHaveBeenCalledTimes(1);
      expect(countListedLaunches).toHaveBeenCalledTimes(1);
      expect(countLaunches).toHaveBeenCalledTimes(1);
    });

    it("reads the indexer again once five seconds have passed, measuring the age from a fresh now", async () => {
      await explore("?age=24h");
      later(5_000);

      await explore("?age=24h");

      expect(findListedLaunches).toHaveBeenCalledTimes(2);
      expect(findListedLaunches).toHaveBeenLastCalledWith(
        {
          sort: "recent-buys",
          since: NOW + 5 - DAY,
          graduated: false,
          q: "",
          quote: null,
          creator: null,
        },
        expect.anything(),
        NO_RATES,
      );
    });

    it("keys each response by route, sort, age, page and page size, with the defaults written out", async () => {
      await explore();
      await explore("?sort=recent-buys&age=all&page=1&pageSize=50");
      await explore("?sort=market-cap&age=7d&page=3&pageSize=6");

      expect(cacheRedis.setex).toHaveBeenCalledTimes(2);
      expect(cacheRedis.setex).toHaveBeenCalledWith(
        "market:v2:explore:sort=recent-buys&age=all&page=1&pageSize=50",
        5,
        expect.any(String),
      );
      expect(cacheRedis.setex).toHaveBeenCalledWith(
        "market:v2:explore:sort=market-cap&age=7d&page=3&pageSize=6",
        5,
        expect.any(String),
      );
    });

    it("holds a volume page under its own key, apart from the other sorts", async () => {
      await explore("?sort=volume&age=7d");
      await explore("?sort=volume&age=7d");
      await explore("?sort=volume&age=24h");

      expect(findListedLaunches).toHaveBeenCalledTimes(2);
      expect(cacheRedis.setex).toHaveBeenCalledWith(
        "market:v2:explore:sort=volume&age=7d&page=1&pageSize=50",
        5,
        expect.any(String),
      );
    });

    it("keeps each sort and age apart", async () => {
      await explore("?sort=newest");
      await explore("?sort=oldest");
      await explore("?sort=oldest&age=24h");

      expect(findListedLaunches).toHaveBeenCalledTimes(3);
    });
  });
});

const search = (query = "") => request(app).get(`/api/v1/market/tokens/search${query}`);

const ADDRESS = `0x${"Ab".repeat(20)}`;

describe("GET /api/v1/market/tokens/search", () => {
  beforeEach(() => {
    useFakeRedis();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW * 1000);
    vi.mocked(countListedLaunches).mockResolvedValue(2);
    vi.mocked(findListedLaunches).mockResolvedValue([row(), curveRow({ token: other })]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts while the dollar rates are read, so a slow feed never delays the count", async () => {
    ratesAfterTheCount();

    const res = await search();

    expect(res.status).toBe(200);
    expect(res.body.data.tokens[0].quoteUsd).toBe(225.66);
  });

  it("serves each token's dollar rate, and hands the rates to the search, so it sorts in dollars", async () => {
    vi.mocked(readDollarRates).mockResolvedValue(RATES);

    const { body } = await search();

    expect(body.data.tokens[0].quoteUsd).toBe(225.66);
    expect(findListedLaunches).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      RATES,
    );
  });

  it("answers 200 with no credential, because anyone can search", async () => {
    const res = await search();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers["cache-control"]).toBe("public, max-age=5");
  });

  it("browses every token by relevance over every age, 24 a page, when nothing is asked for", async () => {
    const { body } = await search();

    expect(body.data).toMatchObject({
      sort: "relevance",
      age: "all",
      page: 1,
      pageSize: 24,
      total: 2,
    });
    expect(findListedLaunches).toHaveBeenCalledWith(
      {
        q: "",
        sort: "relevance",
        since: null,
        graduated: null,
        quote: null,
        creator: null,
      },
      { limit: 24, offset: 0 },
      NO_RATES,
    );
    expect(countListedLaunches).toHaveBeenCalledWith({
      q: "",
      sort: "relevance",
      since: null,
      graduated: null,
      quote: null,
      creator: null,
    });
  });

  it("serves graduated tokens and tokens on their curve alike, each saying which it is", async () => {
    const [grad, climber] = (await search("?q=a")).body.data.tokens;

    expect(grad).toEqual({
      token,
      name: "Graduate",
      symbol: "GRAD",
      logo: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      creator,
      marketCap: "123456789012345678901234567890",
      quoteAsset: { address: nvda, symbol: "NVDA", decimals: 6 },
      quoteUsd: null,
      progress: 100,
      graduated: true,
      launchedAt: 1790000000,
      lastBuyAt: 1790000500,
    });
    expect(climber).toMatchObject({ token: other, graduated: false, progress: 40 });
  });

  it("trims and lowercases the search text before the indexer reads it", async () => {
    await search(`?q=${encodeURIComponent("  NeO %_ ")}`);

    expect(findListedLaunches).toHaveBeenCalledWith(
      expect.objectContaining({ q: "neo %_" }),
      expect.anything(),
      NO_RATES,
    );
  });

  it("takes search text of 64 characters after trimming", async () => {
    const res = await search(`?q=${encodeURIComponent(` ${"x".repeat(64)} `)}`);

    expect(res.status).toBe(200);
  });

  it("reads a quote asset address in any letter case, lowercased", async () => {
    await search(`?quote=${ADDRESS}`);

    expect(findListedLaunches).toHaveBeenCalledWith(
      expect.objectContaining({ quote: ADDRESS.toLowerCase() }),
      expect.anything(),
      NO_RATES,
    );
  });

  it("answers a quote asset no token uses with no tokens, not an error", async () => {
    vi.mocked(countListedLaunches).mockResolvedValue(0);
    vi.mocked(findListedLaunches).mockResolvedValue([]);

    const res = await search(`?quote=0x${"99".repeat(20)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokens: [], total: 0 });
  });

  const AGES: [string, number | null][] = [
    ["all", null],
    ["24h", NOW - DAY],
    ["7d", NOW - 7 * DAY],
  ];

  it.each(
    ["relevance", "market-cap", "volume", "newest", "oldest"].flatMap((sort) =>
      AGES.map(([age, since]) => [sort, age, since] as const),
    ),
  )("reads %s over %s, the age reaching back from now", async (sort, age, since) => {
    const res = await search(`?sort=${sort}&age=${age}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ sort, age });
    expect(findListedLaunches).toHaveBeenCalledWith(
      { q: "", sort, since, graduated: null, quote: null, creator: null },
      expect.anything(),
      NO_RATES,
    );
  });

  it("serves each token's volume under the volume sort, as a raw integer string", async () => {
    vi.mocked(findListedLaunches).mockResolvedValue([
      { ...row(), volume: "98765432109876543210987654321" },
    ]);

    const [item] = (await search("?sort=volume")).body.data.tokens;

    expect(item.volume).toBe("98765432109876543210987654321");
  });

  it.each(["relevance", "market-cap", "newest", "oldest"])(
    "serves no volume under %s",
    async (sort) => {
      const [item] = (await search(`?sort=${sort}`)).body.data.tokens;

      expect(item).not.toHaveProperty("volume");
    },
  );

  it.each([6, 10, 20, 24, 50])("reads pages of %i when asked", async (size) => {
    await search(`?page=3&pageSize=${size}`);

    expect(findListedLaunches).toHaveBeenCalledWith(
      expect.anything(),
      {
        limit: size,
        offset: 2 * size,
      },
      NO_RATES,
    );
  });

  it("answers a page past the end with no tokens and the total", async () => {
    vi.mocked(countListedLaunches).mockResolvedValue(3);
    vi.mocked(findListedLaunches).mockResolvedValue([]);

    const res = await search("?page=4");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokens: [], total: 3 });
  });

  it.each([
    ["search text past 64 characters", `?q=${"x".repeat(65)}`],
    ["search text sent twice", "?q=a&q=b"],
    ["search text holding a NUL", "?q=a%00b"],
    ["search text holding a tab", "?q=a%09b"],
    ["an unknown sort", "?sort=hot"],
    ["the Explore list's recent-buys sort", "?sort=recent-buys"],
    ["a sort in capitals", "?sort=RELEVANCE"],
    ["an empty sort", "?sort="],
    ["an unknown age", "?age=1h"],
    ["an empty age", "?age="],
    ["a quote that is not an address", "?quote=nvda"],
    ["a partial quote address", "?quote=0xc1c1"],
    ["an empty quote", "?quote="],
    ["a quote sent twice", `?quote=${ADDRESS}&quote=${ADDRESS}`],
    ["page zero", "?page=0"],
    ["a page in exponent form", "?page=1e1"],
    ["a page past the last one allowed", "?page=100001"],
    ["a page size outside the set", "?pageSize=12"],
    ["a page size sent twice", "?pageSize=10&pageSize=20"],
  ])("answers 400 for %s", async (_label, query) => {
    const res = await search(query);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(findListedLaunches).not.toHaveBeenCalled();
  });

  it("answers 503 when the indexer does not answer, and holds nothing, so the next request asks again", async () => {
    vi.mocked(countListedLaunches).mockRejectedValueOnce(
      new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
    );

    const res = await search();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
    expect(res.headers["cache-control"]).toBeUndefined();
    expect((await search()).status).toBe(200);
  });

  it("answers 503 busy with a one second Retry-After when the lists lane is full, not unavailable", async () => {
    vi.mocked(countListedLaunches).mockRejectedValueOnce(new IndexerBusyError("lists"));

    const res = await search();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_BUSY");
    expect(res.headers["retry-after"]).toBe("1");
    expect(res.headers["cache-control"]).toBeUndefined();
    expect((await search()).status).toBe(200);
  });

  describe("the five second cache", () => {
    const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

    it("answers a repeat request within five seconds without reaching the indexer", async () => {
      const first = await search("?q=neo");
      later(4_900);
      const second = await search("?q=neo");

      expect(second.body).toEqual(first.body);
      expect(findListedLaunches).toHaveBeenCalledTimes(1);
      expect(countListedLaunches).toHaveBeenCalledTimes(1);
    });

    it("reads the indexer again once five seconds have passed, measuring the age from a fresh now", async () => {
      await search("?age=24h");
      later(5_000);

      await search("?age=24h");

      expect(findListedLaunches).toHaveBeenCalledTimes(2);
      expect(findListedLaunches).toHaveBeenLastCalledWith(
        expect.objectContaining({ since: NOW + 5 - DAY }),
        expect.anything(),
        NO_RATES,
      );
    });

    it("keys each response by every query value, with the defaults written out", async () => {
      await search();
      await search("?q=&sort=relevance&age=all&page=1&pageSize=24");

      expect(cacheRedis.setex).toHaveBeenCalledTimes(1);
      expect(cacheRedis.setex).toHaveBeenCalledWith(
        "market:v2:search:q=&sort=relevance&age=all&quote=&page=1&pageSize=24",
        5,
        expect.any(String),
      );
    });

    it("keys the search text trimmed and lowercased and the quote lowercased, so each spelling shares one entry", async () => {
      await search(`?q=${encodeURIComponent(" NeO ")}&quote=${ADDRESS}`);
      await search(`?q=neo&quote=${ADDRESS.toLowerCase()}`);

      expect(findListedLaunches).toHaveBeenCalledTimes(1);
      expect(cacheRedis.setex).toHaveBeenCalledWith(
        `market:v2:search:q=neo&sort=relevance&age=all&quote=${ADDRESS.toLowerCase()}&page=1&pageSize=24`,
        5,
        expect.any(String),
      );
    });

    it("encodes the search text, so text holding & or = cannot run into the next value", async () => {
      await search(`?q=${encodeURIComponent("a&sort=volume")}`);

      expect(cacheRedis.setex).toHaveBeenCalledWith(
        "market:v2:search:q=a%26sort%3Dvolume&sort=relevance&age=all&quote=&page=1&pageSize=24",
        5,
        expect.any(String),
      );
    });

    it("keeps each search text, sort, age and quote apart", async () => {
      await search("?q=neo");
      await search("?q=ne");
      await search("?q=neo&sort=newest");
      await search("?q=neo&age=7d");
      await search(`?q=neo&quote=${ADDRESS}`);

      expect(findListedLaunches).toHaveBeenCalledTimes(5);
    });
  });
});

// A creator's address, checksummed, as a wallet library hands it over.
const CREATOR = "0xDDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd";

const created = (wallet = CREATOR, query = "") =>
  request(app).get(`/api/v1/market/creators/${wallet}/tokens${query}`);

// Every token the creator launched, newest first, whatever its stage.
const createdBy = (wallet: string) => ({
  sort: "newest",
  since: null,
  graduated: null,
  q: "",
  quote: null,
  creator: wallet,
});

describe("GET /api/v1/market/creators/:creator/tokens", () => {
  beforeEach(() => {
    useFakeRedis();
    vi.mocked(countListedLaunches).mockResolvedValue(2);
    vi.mocked(findListedLaunches).mockResolvedValue([row(), curveRow({ token: other })]);
  });

  it("answers 200 with no credential, because anyone can see what a wallet launched", async () => {
    const res = await created();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers["cache-control"]).toBe("public, max-age=5");
  });

  it("lists every token the creator launched, graduated or not, newest first, twenty four a page, when nothing is asked for", async () => {
    const { body } = await created();

    expect(body.data).toMatchObject({ page: 1, pageSize: 24, total: 2 });
    expect(findListedLaunches).toHaveBeenCalledWith(
      createdBy(creator),
      { limit: 24, offset: 0 },
      NO_RATES,
    );
    expect(countListedLaunches).toHaveBeenCalledWith(createdBy(creator));
  });

  it("serves the page, the page size, the total and the tokens, and nothing else", async () => {
    const { body } = await created();

    expect(Object.keys(body.data).sort()).toEqual([
      "page",
      "pageSize",
      "tokens",
      "total",
    ]);
  });

  it("serves graduated tokens and tokens on their curve alike, in the order the indexer returned them", async () => {
    const tokens = (await created()).body.data.tokens as {
      token: string;
      graduated: boolean;
      progress: number;
    }[];

    expect(tokens.map((item) => [item.token, item.graduated, item.progress])).toEqual([
      [token, true, 100],
      [other, false, 40],
    ]);
  });

  it.each([
    ["checksummed", CREATOR],
    ["in lowercase", CREATOR.toLowerCase()],
    ["in capitals", `0x${CREATOR.slice(2).toUpperCase()}`],
    ["in a mixed case that is not its checksum", `0x${"dD".repeat(20)}`],
  ])(
    "reads an address sent %s as the lowercase one the indexer holds",
    async (_label, wallet) => {
      await created(wallet);

      expect(findListedLaunches).toHaveBeenCalledWith(
        createdBy(creator),
        expect.anything(),
        NO_RATES,
      );
    },
  );

  it("answers a wallet that launched nothing with 200, no tokens and a total of 0", async () => {
    vi.mocked(countListedLaunches).mockResolvedValue(0);
    vi.mocked(findListedLaunches).mockResolvedValue([]);

    const res = await created();

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ page: 1, pageSize: 24, total: 0, tokens: [] });
  });

  it.each([6, 10, 20, 24, 50])("reads pages of %i when asked", async (size) => {
    const res = await created(CREATOR, `?page=3&pageSize=${size}`);

    expect(res.body.data).toMatchObject({ page: 3, pageSize: size });
    expect(findListedLaunches).toHaveBeenCalledWith(
      expect.anything(),
      { limit: size, offset: 2 * size },
      NO_RATES,
    );
  });

  it.each([
    ["an address one character short", `0x${"d".repeat(39)}`],
    ["an address one character long", `0x${"d".repeat(41)}`],
    ["an address without its 0x", "d".repeat(40)],
    ["an address holding a character that is not hex", `0x${"g".repeat(40)}`],
    ["a name rather than an address", "alice.eth"],
  ])("answers 400 for %s", async (_label, wallet) => {
    const res = await created(wallet);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(findListedLaunches).not.toHaveBeenCalled();
  });

  it.each([
    ["page zero", "?page=0"],
    ["a page size outside the set", "?pageSize=12"],
  ])("answers 400 for %s", async (_label, query) => {
    const res = await created(CREATOR, query);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("answers 503 when the indexer does not answer, and never caches it", async () => {
    vi.mocked(countListedLaunches).mockRejectedValueOnce(
      new IndexerUnreachableError(new Error("connect ECONNREFUSED")),
    );

    const res = await created();

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("INDEXER_UNAVAILABLE");
    expect(res.headers["cache-control"]).toBeUndefined();
    expect((await created()).status).toBe(200);
  });

  describe("the five second cache", () => {
    it("keys each response by the lowercase address, page and page size, so each spelling shares one entry", async () => {
      await created(CREATOR);
      await created(CREATOR.toLowerCase(), "?page=1&pageSize=24");

      expect(findListedLaunches).toHaveBeenCalledTimes(1);
      expect(cacheRedis.setex).toHaveBeenCalledWith(
        `market:v2:creator:creator=${creator}&page=1&pageSize=24`,
        5,
        expect.any(String),
      );
    });

    it("keeps each creator apart", async () => {
      await created(creator);
      await created(other);

      expect(findListedLaunches).toHaveBeenCalledTimes(2);
    });
  });
});
