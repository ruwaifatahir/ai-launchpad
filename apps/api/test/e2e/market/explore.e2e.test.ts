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
import { findListedLaunches } from "@/features/market/tokens/tokens.repo";
import { cacheRedis, redis } from "@/lib/redis/client";
import {
  BRAND_NEW,
  E18,
  FRESH,
  FRESH_TWIN,
  GRADUATED,
  LAPSED,
  LIST_NOW,
  NVDA,
  OTHER,
  REVIVED,
  SWEPT,
  UNTRADED,
  WEEK_OLD,
  adminPool,
  deployIndexer,
  dropIndexer,
  ensureDatabase,
} from "@test/e2e/_helpers/indexer";

// Every query the Explore list makes runs here against Postgres, over the views a
// Ponder deploy leaves in the indexer schema. The curve filter, each sort's window,
// its order, its tie break and both counts are SQL, so this suite is where they are
// proved.
//
// The clock is held at LIST_NOW, which the seed's windows are written against. Nine
// tokens are on their curve and four have graduated, thirteen launched in all.
//
// Market caps are in whole ETH but OTHER's, which is 30 NVDA, raw 30000000, the
// smallest raw amount of all.
//
//   token       launched       last buy       market cap
//   OTHER       long ago       long ago       30 NVDA
//   UNTRADED    long ago       never          1
//   SWEPT       long ago       long ago       900, curve closed, pool not open
//   REVIVED     long ago       1h ago         2
//   LAPSED      8d ago         25h ago        4
//   WEEK_OLD    3d ago         2d ago         10
//   FRESH       2h ago         10m ago        3
//   FRESH_TWIN  2h ago         10m ago        3
//   BRAND_NEW   1m ago         never          1
//
// Volume, in whole ETH but OTHER's, which is 4 NVDA, raw 4000000. Each 24h and 7d sum
// is over the hours the seed puts on and around the window edges.
//
//   token       24h   7d   all
//   REVIVED       1   11   111
//   LAPSED        -    7     7
//   SWEPT         -    -     6
//   WEEK_OLD      -    4     4
//   FRESH         3    3     3
//   FRESH_TWIN    3    3     3
//   OTHER         -    -     4 NVDA

const KEY_PATTERNS = ["rl:*", "market:*"];

const clearKeys = async () => {
  for (const pattern of KEY_PATTERNS) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
};

let db: pg.Pool;

const explore = (query = "") => request(app).get(`/api/v1/market/tokens/explore${query}`);

type Item = { token: string; progress: number; graduated: boolean; volume?: string };

const tokensOf = (res: request.Response) =>
  (res.body.data.tokens as Item[]).map((item) => item.token);

beforeAll(async () => {
  await ensureDatabase();
  db = adminPool();
  await dropIndexer(db);
  await deployIndexer(db, "e2e0601");
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

// Each sort with each age, in the order the route must serve them.
const EXPECTED: [string, string, string[]][] = [
  ["recent-buys", "all", [FRESH, FRESH_TWIN, REVIVED, LAPSED, WEEK_OLD, OTHER, SWEPT]],
  ["recent-buys", "24h", [FRESH, FRESH_TWIN, REVIVED]],
  ["recent-buys", "7d", [FRESH, FRESH_TWIN, REVIVED, LAPSED, WEEK_OLD]],
  [
    "newest",
    "all",
    [BRAND_NEW, FRESH, FRESH_TWIN, WEEK_OLD, LAPSED, OTHER, UNTRADED, SWEPT, REVIVED],
  ],
  ["newest", "24h", [BRAND_NEW, FRESH, FRESH_TWIN]],
  ["newest", "7d", [BRAND_NEW, FRESH, FRESH_TWIN, WEEK_OLD]],
  [
    "oldest",
    "all",
    [OTHER, UNTRADED, SWEPT, REVIVED, LAPSED, WEEK_OLD, FRESH, FRESH_TWIN, BRAND_NEW],
  ],
  ["oldest", "24h", [FRESH, FRESH_TWIN, BRAND_NEW]],
  ["oldest", "7d", [WEEK_OLD, FRESH, FRESH_TWIN, BRAND_NEW]],
  [
    "market-cap",
    "all",
    [SWEPT, WEEK_OLD, LAPSED, FRESH, FRESH_TWIN, REVIVED, UNTRADED, BRAND_NEW, OTHER],
  ],
  ["market-cap", "24h", [FRESH, FRESH_TWIN, BRAND_NEW]],
  ["market-cap", "7d", [WEEK_OLD, FRESH, FRESH_TWIN, BRAND_NEW]],
];

describe("a visitor explores the tokens on their curve", () => {
  it.each(EXPECTED)(
    "lists %s over %s in order, ties by address",
    async (sort, age, expected) => {
      const res = await explore(`?sort=${sort}&age=${age}`);

      expect(res.status).toBe(200);
      expect(tokensOf(res)).toEqual(expected);
      expect(res.body.data).toMatchObject({
        sort,
        age,
        total: expected.length,
        launched: 13,
      });
      for (const item of res.body.data.tokens) expect(item).not.toHaveProperty("volume");
    },
  );

  it("sorts by recent buys over every age when nothing is asked for", async () => {
    expect(tokensOf(await explore())).toEqual(EXPECTED[0][2]);
  });

  it("leaves out every graduated token", async () => {
    const tokens = tokensOf(await explore("?sort=market-cap"));

    expect(tokens).not.toContain(GRADUATED);
  });

  it("lists a token whose curve closed before its pool opened, its progress capped at 100", async () => {
    const items = (await explore("?sort=market-cap")).body.data.tokens as Item[];
    const swept = items.find((item) => item.token === SWEPT);

    expect(swept).toMatchObject({ graduated: false, progress: 100 });
  });

  it("reads progress off the curve for a token part of the way there", async () => {
    const items = (await explore()).body.data.tokens as Item[];

    expect(items.find((item) => item.token === FRESH)?.progress).toBe(40);
  });

  it("pages through a sort, the tie break holding across the page edge", async () => {
    const first = await explore("?sort=newest&pageSize=6");
    const second = await explore("?sort=newest&pageSize=6&page=2");

    expect([...tokensOf(first), ...tokensOf(second)]).toEqual(EXPECTED[3][2]);
    expect(second.body.data.total).toBe(9);
  });

  it("answers a page past the end with no tokens and both totals", async () => {
    const res = await explore("?page=2");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokens: [], total: 7, launched: 13 });
  });
});

const eth = (n: bigint) => (n * E18).toString();

// Each window's ranking, and the volume each token must carry in it.
const VOLUME: [string, [string, string][]][] = [
  [
    "24h",
    [
      [FRESH, eth(3n)],
      [FRESH_TWIN, eth(3n)],
      [REVIVED, eth(1n)],
    ],
  ],
  [
    "7d",
    [
      [REVIVED, eth(11n)],
      [LAPSED, eth(7n)],
      [WEEK_OLD, eth(4n)],
      [FRESH, eth(3n)],
      [FRESH_TWIN, eth(3n)],
    ],
  ],
  [
    "all",
    [
      [REVIVED, eth(111n)],
      [LAPSED, eth(7n)],
      [SWEPT, eth(6n)],
      [WEEK_OLD, eth(4n)],
      [FRESH, eth(3n)],
      [FRESH_TWIN, eth(3n)],
      [OTHER, "4000000"],
    ],
  ],
];

describe("a visitor sorts the tokens on their curve by volume", () => {
  it.each(VOLUME)(
    "ranks by the volume over %s, largest first, ties by address, leaving out tokens with none",
    async (age, expected) => {
      const res = await explore(`?sort=volume&age=${age}`);
      const items = res.body.data.tokens as Item[];

      expect(res.status).toBe(200);
      expect(items.map((item) => [item.token, item.volume])).toEqual(expected);
      expect(res.body.data).toMatchObject({
        sort: "volume",
        age,
        total: expected.length,
        launched: 13,
      });
    },
  );

  it("pages through the volume ranking, the tie break holding across the page edge", async () => {
    const first = await explore("?sort=volume&age=7d&pageSize=6");
    const second = await explore("?sort=volume&age=7d&pageSize=6&page=2");

    expect(tokensOf(first)).toEqual(VOLUME[1][1].map(([token]) => token));
    expect(tokensOf(second)).toEqual([]);
    expect(second.body.data.total).toBe(5);
  });

  it("sums the hours from a fresh now once the clock moves on", async () => {
    // An hour later, FRESH's and FRESH_TWIN's hours are still inside the day, and
    // REVIVED's hour 23 ago has left it.
    vi.setSystemTime((LIST_NOW + 3600) * 1000);

    const res = await explore("?sort=volume&age=24h");

    expect(tokensOf(res)).toEqual([FRESH, FRESH_TWIN]);
  });
});

describe("the five second cache", () => {
  it("holds a served page in Redis for five seconds, keyed by sort, age, page and page size", async () => {
    await explore("?sort=oldest&age=7d&pageSize=24");

    const key = "market:v2:explore:sort=oldest&age=7d&page=1&pageSize=24";
    const ttl = await redis.ttl(key);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5);
    expect(JSON.parse((await redis.get(key)) as string).total).toBe(4);
  });
});

// With dollar rates on, the list ranks market cap and volume in dollars. The rates reach
// the SQL as a joined table, so the join, the conversion by each quote asset's decimals,
// the rateless tokens last and the raw tie break are all proved here. The repo is called
// directly: this suite's env has dollar rates off, and the rates themselves come from
// Chainlink, which test/features/market/dollar-rates covers.
describe("a list ranked in dollars", () => {
  const ETH = "0x0000000000000000000000000000000000000000";
  const ON_CURVE = { since: null, graduated: false, q: "", quote: null, creator: null };
  const PAGE = { limit: 50, offset: 0 };

  const ranked = async (sort: "market-cap" | "volume", rates: Map<string, number>) =>
    (await findListedLaunches({ ...ON_CURVE, sort }, PAGE, rates)).map(
      (row) => row.token,
    );

  it("ranks market caps across quote assets by what each is worth in dollars", async () => {
    // OTHER's 30 NVDA is $6,769.80: below FRESH's 3 ETH at $8,073, above REVIVED's 2 ETH
    // at $5,382. Raw, it is the smallest of all and comes last.
    const tokens = await ranked(
      "market-cap",
      new Map([
        [ETH, 2691],
        [NVDA, 225.66],
      ]),
    );

    expect(tokens).toEqual([
      SWEPT,
      WEEK_OLD,
      LAPSED,
      FRESH,
      FRESH_TWIN,
      OTHER,
      REVIVED,
      UNTRADED,
      BRAND_NEW,
    ]);
  });

  it("puts every token whose quote asset has no rate after those that have one, in raw order", async () => {
    const tokens = await ranked("market-cap", new Map([[NVDA, 225.66]]));

    expect(tokens).toEqual([
      OTHER,
      SWEPT,
      WEEK_OLD,
      LAPSED,
      FRESH,
      FRESH_TWIN,
      REVIVED,
      UNTRADED,
      BRAND_NEW,
    ]);
  });

  it("ranks volume in dollars, and breaks a tie in dollars on the raw amount", async () => {
    // At a dollar each, OTHER's 4 NVDA ties WEEK_OLD's 4 ETH. WEEK_OLD's raw 4e18 is
    // larger than OTHER's raw 4000000, so it goes first.
    const tokens = await ranked(
      "volume",
      new Map([
        [ETH, 1],
        [NVDA, 1],
      ]),
    );

    expect(tokens).toEqual([REVIVED, LAPSED, SWEPT, WEEK_OLD, OTHER, FRESH, FRESH_TWIN]);
  });

  it("ranks raw amounts exactly as before when it holds no rate", async () => {
    const tokens = await ranked("market-cap", new Map());

    expect(tokens).toEqual([
      SWEPT,
      WEEK_OLD,
      LAPSED,
      FRESH,
      FRESH_TWIN,
      REVIVED,
      UNTRADED,
      BRAND_NEW,
      OTHER,
    ]);
  });
});
