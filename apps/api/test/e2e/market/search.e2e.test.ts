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
  BRAND_NEW,
  E18,
  FRESH,
  FRESH_TWIN,
  GRADUATED,
  LIST_NOW,
  NVDA,
  OTHER,
  REVIVED,
  SWEPT,
  TIED_HIGH,
  TIED_LOW,
  UNTRADED,
  adminPool,
  deployIndexer,
  dropIndexer,
  ensureDatabase,
} from "@test/e2e/_helpers/indexer";

// Every query Search makes runs here against Postgres, over the views a Ponder deploy
// leaves in the indexer schema. Matching, the relevance ranks, escaping, the pair
// filter and each order are SQL, so this suite is where they are proved.
//
// The shared seed holds thirteen launches, four graduated. This suite adds ten of its
// own, into its own deploy, each a copy of UNTRADED under a new address, name, ticker
// and market cap. Market caps are in whole ETH.
//
//   token        name          ticker   cap   searched by
//   MOON_EXACT   Something     MOON       1   moon: exact ticker
//   MOON_TICKER  Rocket        MOONR      7   moon: ticker starts with it
//   MOON_NAME    Moonshot      SHOT       5   moon: name starts with it
//   MOON_BLUE    Blue Moon     BMN      100   moon: contains it, graduated
//   MOON_HONEY   Honeymoon     HNY      100   moon: contains it
//   PERCENT      100% Pure     PCT        1   %
//   HUNDRED_X    100X Pure     HXP        1   what % would match as a wildcard
//   UNDERSCORE   a_b           AB_        1   _
//   A_X_B        aXb           AXB        1   what _ would match as a wildcard
//   BACKSLASH    back\slash    BKS        1   the escape character itself
//
// Each is written in the order a query that forgot a rank or its tie break would most
// likely return the wrong way round: the lowest rank first, and MOON_HONEY, whose
// address sorts first, after MOON_BLUE.

const SHA = "e2e0505";
const at = (byte: string) => `0x${byte.repeat(20)}`;

const MOON_EXACT = at("e5");
const MOON_TICKER = at("e4");
const MOON_NAME = at("e3");
const MOON_BLUE = at("e2");
const MOON_HONEY = at("e1");
const PERCENT = at("f1");
const HUNDRED_X = at("f2");
const UNDERSCORE = at("f3");
const A_X_B = at("f4");
const BACKSLASH = at("f5");

interface Added {
  token: string;
  name: string;
  symbol: string;
  cap: bigint;
  graduated?: boolean;
}

const ADDED: Added[] = [
  { token: MOON_HONEY, name: "Honeymoon", symbol: "HNY", cap: 100n },
  { token: MOON_BLUE, name: "Blue Moon", symbol: "BMN", cap: 100n, graduated: true },
  { token: MOON_NAME, name: "Moonshot", symbol: "SHOT", cap: 5n },
  { token: MOON_TICKER, name: "Rocket", symbol: "MOONR", cap: 7n },
  { token: MOON_EXACT, name: "Something", symbol: "MOON", cap: 1n },
  { token: HUNDRED_X, name: "100X Pure", symbol: "HXP", cap: 1n },
  { token: PERCENT, name: "100% Pure", symbol: "PCT", cap: 1n },
  { token: A_X_B, name: "aXb", symbol: "AXB", cap: 1n },
  { token: UNDERSCORE, name: "a_b", symbol: "AB_", cap: 1n },
  { token: BACKSLASH, name: "back\\slash", symbol: "BKS", cap: 1n },
];

// Thirteen in the shared seed and ten here.
const EVERY_TOKEN = 23;

const KEY_PATTERNS = ["rl:*", "market:*"];

const clearKeys = async () => {
  for (const pattern of KEY_PATTERNS) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
};

let db: pg.Pool;

// A copy of UNTRADED's launch row under another address, name, ticker and market cap.
const addLaunch = (launch: Added) =>
  db.query(
    `INSERT INTO indexer_${SHA}.launch
     SELECT (jsonb_populate_record(
       launch,
       jsonb_build_object(
         'token', $1::text,
         'name', $2::text,
         'symbol', $3::text,
         'market_cap', $4::numeric,
         'graduated', $5::boolean
       )
     )).*
     FROM indexer_${SHA}.launch
     WHERE token = $6`,
    [
      launch.token,
      launch.name,
      launch.symbol,
      (launch.cap * E18).toString(),
      launch.graduated ?? false,
      UNTRADED,
    ],
  );

const search = (query = "") => request(app).get(`/api/v1/market/tokens/search${query}`);

const q = (text: string) => `?q=${encodeURIComponent(text)}`;

type Item = { token: string; graduated: boolean; progress: number; volume?: string };

const tokensOf = (res: request.Response) =>
  (res.body.data.tokens as Item[]).map((item) => item.token);

beforeAll(async () => {
  await ensureDatabase();
  db = adminPool();
  await dropIndexer(db);
  await deployIndexer(db, SHA);
  for (const launch of ADDED) await addLaunch(launch);
});

beforeEach(async () => {
  await clearKeys();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(LIST_NOW * 1000);
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

describe("a visitor searches by name or ticker", () => {
  it("ranks an exact ticker, then a name or ticker starting with q, then one containing it, market cap and address breaking ties", async () => {
    const res = await search(q("moon"));

    expect(res.status).toBe(200);
    expect(tokensOf(res)).toEqual([
      MOON_EXACT,
      MOON_TICKER,
      MOON_NAME,
      MOON_HONEY,
      MOON_BLUE,
    ]);
    expect(res.body.data).toMatchObject({ sort: "relevance", total: 5 });
  });

  it("ignores letter case in the text", async () => {
    expect(tokensOf(await search(q("MoOn")))).toEqual(tokensOf(await search(q("moon"))));
  });

  it("lists graduated tokens beside tokens on their curve, each saying which it is", async () => {
    const items = (await search(q("moon"))).body.data.tokens as Item[];

    expect(items.find((item) => item.token === MOON_BLUE)).toMatchObject({
      graduated: true,
      progress: 100,
    });
    expect(items.find((item) => item.token === MOON_HONEY)).toMatchObject({
      graduated: false,
    });
  });

  it.each([
    ["%", [PERCENT]],
    ["100%", [PERCENT]],
    ["_", [UNDERSCORE]],
    ["a_b", [UNDERSCORE]],
    ["k\\", [BACKSLASH]],
  ])("matches %s as itself, never as a wildcard", async (text, expected) => {
    const res = await search(q(text));

    expect(res.status).toBe(200);
    expect(tokensOf(res)).toEqual(expected);
  });

  it("sorts the matches by another order when asked", async () => {
    const res = await search(`${q("moon")}&sort=market-cap`);

    expect(tokensOf(res)).toEqual([
      MOON_HONEY,
      MOON_BLUE,
      MOON_TICKER,
      MOON_NAME,
      MOON_EXACT,
    ]);
  });

  it("answers text nothing matches with no tokens", async () => {
    const res = await search(q("zzz"));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokens: [], total: 0 });
  });
});

describe("a visitor searches by address", () => {
  it("matches a full address in mixed case to that token alone, graduated or not", async () => {
    const res = await search(q(GRADUATED.toUpperCase().replace("0X", "0x")));

    expect(tokensOf(res)).toEqual([GRADUATED]);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.tokens[0].graduated).toBe(true);
  });

  it("matches no address from part of one", async () => {
    const res = await search(q(MOON_BLUE.slice(0, 20)));

    expect(res.body.data).toMatchObject({ tokens: [], total: 0 });
  });
});

describe("a visitor browses with an empty search", () => {
  it("lists every token by market cap, graduated or not", async () => {
    const res = await search();

    expect(res.body.data.total).toBe(EVERY_TOKEN);
    expect(tokensOf(res).slice(0, 5)).toEqual([
      SWEPT,
      MOON_HONEY,
      MOON_BLUE,
      GRADUATED,
      TIED_LOW,
    ]);
  });

  it("keeps the tokens launched inside the age under relevance", async () => {
    const res = await search("?age=24h");

    expect(tokensOf(res)).toEqual([FRESH, FRESH_TWIN, BRAND_NEW]);
  });

  it("ranks the window's volume under the volume sort, graduated tokens included, each carrying its volume", async () => {
    const res = await search("?sort=volume&age=24h");
    const items = res.body.data.tokens as Item[];

    expect(tokensOf(res)).toEqual([FRESH, FRESH_TWIN, TIED_HIGH, REVIVED]);
    expect(items.map((item) => item.volume)).toEqual(
      [3n, 3n, 1n, 1n].map((n) => (n * E18).toString()),
    );
    expect(res.body.data.total).toBe(4);
  });

  it.each(["relevance", "market-cap", "newest", "oldest"])(
    "serves no volume under %s",
    async (sort) => {
      const items = (await search(`?sort=${sort}`)).body.data.tokens as Item[];

      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(item).not.toHaveProperty("volume");
    },
  );

  it("pages through, the tie break holding across the page edge", async () => {
    const all = tokensOf(await search("?pageSize=50"));
    const first = await search("?pageSize=6");
    const second = await search("?pageSize=6&page=2");

    expect([...tokensOf(first), ...tokensOf(second)]).toEqual(all.slice(0, 12));
  });
});

describe("a visitor filters by pair", () => {
  it("keeps the tokens quoted in one asset, the address in any letter case", async () => {
    const res = await search(`?quote=${NVDA.toUpperCase().replace("0X", "0x")}`);

    expect(tokensOf(res)).toEqual([OTHER]);
    expect(res.body.data.total).toBe(1);
  });

  it("combines with the search text", async () => {
    const res = await search(`${q("moon")}&quote=${NVDA}`);

    expect(res.body.data).toMatchObject({ tokens: [], total: 0 });
  });

  it("answers a quote asset no token uses with no tokens, not an error", async () => {
    const res = await search(`?quote=0x${"99".repeat(20)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokens: [], total: 0 });
  });
});

describe("the market rate limit and the five second cache", () => {
  it("holds each search in Redis for five seconds, keyed with q trimmed and lowercased", async () => {
    await search(q("  MOON "));

    const key =
      "market:v2:search:q=moon&sort=relevance&age=all&quote=&page=1&pageSize=24";
    const ttl = await redis.ttl(key);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5);
    expect(await redis.keys("rl:market:*")).not.toHaveLength(0);
  });
});
