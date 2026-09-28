import pg from "pg";
import { readFileSync } from "node:fs";
import { env } from "@/config/env";

// A stand in for the indexer's database, built the way Ponder builds it: tables in an
// indexer_<sha> schema, and views in indexer pointing at them. The backend's queries
// run against the views, as they do deployed. Column names and types copy
// apps/indexer/ponder.schema.ts as Ponder lays it out in Postgres: every bigint a
// numeric(78,0), every hex a text, every enum a type in the sha schema.
//
// Seeding writes, so the suite owns INDEXER_DATABASE_URL outright: it drops the indexer
// schema and every indexer_<sha> schema there. It refuses any host but this machine,
// so a .env pointed at a deployed indexer fails here rather than wiping it.

const url = new URL(env.INDEXER_DATABASE_URL);

if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname))
  throw new Error(
    `The e2e suite drops and seeds the indexer schema at INDEXER_DATABASE_URL, and that ` +
      `points at ${url.hostname}. Point it at a local Postgres.`,
  );

const database = url.pathname.slice(1);

// The database itself is created if it is missing, from the server's own postgres
// database, so a clean machine needs nothing beyond the URL.
export const ensureDatabase = async () => {
  const server = new URL(url);
  server.pathname = "/postgres";

  const client = new pg.Client({ connectionString: server.toString() });
  await client.connect();

  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [database],
    );
    if (!rowCount) await client.query(`CREATE DATABASE ${pg.escapeIdentifier(database)}`);
  } finally {
    await client.end();
  }
};

export const adminPool = () =>
  new pg.Pool({ connectionString: env.INDEXER_DATABASE_URL });

// Addresses are lowercase, as the indexer writes them.
const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const hashOf = (block: number, log: number) =>
  `0x${block.toString(16).padStart(32, "0")}${log.toString(16).padStart(32, "0")}`;

export const GRADUATED = address(0xa1);
export const OTHER = address(0xa2);
export const UNTRADED = address(0xa3);
export const UNKNOWN = address(0xa4);
// Seeded for the token lists. TIED_LOW and TIED_HIGH share a market cap. SMALL_CAP's
// market cap has one digit fewer than theirs and a larger first digit, so a sort on
// text rather than number puts it first. SWEPT's curve has closed but its pool has not
// opened, so the indexer does not mark it graduated.
export const TIED_LOW = address(0xa5);
export const TIED_HIGH = address(0xa6);
export const SWEPT = address(0xa7);
export const SMALL_CAP = address(0xa8);

// Seeded for the Explore list, each still on its curve, spread across the age windows
// measured back from LIST_NOW. FRESH and FRESH_TWIN launched and were last bought in
// the same seconds, with the same market cap, so only the address orders them.
// REVIVED launched long ago but was bought within the day. LAPSED was last bought a
// day and an hour ago and launched eight days ago. WEEK_OLD's market cap has one digit
// more than FRESH's and a smaller first digit, so a sort on text puts it after.
// BRAND_NEW launched a minute ago and nobody has bought it.
export const FRESH = address(0xa9);
export const FRESH_TWIN = address(0xaa);
export const REVIVED = address(0xab);
export const WEEK_OLD = address(0xac);
export const BRAND_NEW = address(0xad);
export const LAPSED = address(0xae);

// The moment the list suites read the indexer at, in unix seconds. They fake the clock
// to it, so the seed's windows stay where they were written.
export const LIST_NOW = 1_790_000_000;
const HOUR = 3600;
const DAY = 24 * HOUR;

// The start of the hour LIST_NOW falls in, 800 seconds before it. The indexer keys
// launch_hour by hour starts. The hour LIST_NOW_HOUR - 24 hours opens before the 24h
// window does, so a whole hours sum leaves it out, and LIST_NOW_HOUR - 168 hours
// likewise for 7d.
const LIST_NOW_HOUR = Math.floor(LIST_NOW / HOUR) * HOUR;
const hoursAgo = (n: number) => LIST_NOW_HOUR - n * HOUR;

export const NVDA = address(0xc1);

export const CURVE = address(0xd0);
export const ALICE = address(0xb1);
export const BOB = address(0xb2);
const OPERATOR = address(0xb3);
export const CAROL = address(0xb4);
export const DAVE = address(0xb5);
export const SMALL = [address(0xb6), address(0xb7), address(0xb8)];
export const BURN = "0x000000000000000000000000000000000000dead";

export const E18 = 10n ** 18n;

// One token past what 64 bits hold, so an amount that loses digits as a float shows.
export const HUGE_AMOUNT = (10n ** 30n + 7n).toString();

interface SeedTrade {
  launch: string;
  block: number;
  log: number;
  timestamp: number;
  venue: "curve" | "pool";
  kind: "user" | "buyback" | "fee_conversion";
  side: "buy" | "sell";
  trader: string;
  tokenAmount: bigint | string;
  quoteAmount: bigint;
}

const trade = (launch: string, block: number, log: number, timestamp: number) => ({
  launch,
  block,
  log,
  timestamp,
  venue: "curve" as const,
  kind: "user" as const,
  side: "buy" as const,
  trader: ALICE,
  tokenAmount: 1000n * E18,
  quoteAmount: E18 / 1000n,
});

// The graduated token's twelve trades, oldest first. Three share timestamp 1000: two in
// block 100 and one in block 101. Two share block 202: a buyback and a fee conversion
// in one sweep, priced apart from the trade before them, so a chart bucket holding all
// three shows which one it took as its last. The curve closes after block 120 and the
// pool opens at block 200.
const graduatedTrades: SeedTrade[] = [
  { ...trade(GRADUATED, 100, 2, 1000) },
  { ...trade(GRADUATED, 100, 7, 1000), side: "sell", trader: BOB },
  { ...trade(GRADUATED, 101, 1, 1000) },
  { ...trade(GRADUATED, 110, 0, 1100) },
  { ...trade(GRADUATED, 120, 3, 1200), tokenAmount: 4n * E18, quoteAmount: E18 },
  { ...trade(GRADUATED, 200, 4, 2000), venue: "pool" },
  { ...trade(GRADUATED, 201, 1, 2010), venue: "pool", side: "sell", trader: BOB },
  {
    ...trade(GRADUATED, 202, 2, 2020),
    venue: "pool",
    kind: "buyback",
    trader: OPERATOR,
    quoteAmount: (2n * E18) / 1000n,
  },
  {
    ...trade(GRADUATED, 202, 5, 2020),
    venue: "pool",
    kind: "fee_conversion",
    side: "sell",
    trader: OPERATOR,
    quoteAmount: (3n * E18) / 1000n,
  },
  { ...trade(GRADUATED, 210, 0, 2100), venue: "pool", tokenAmount: HUGE_AMOUNT },
  { ...trade(GRADUATED, 220, 9, 2200), venue: "pool", side: "sell", trader: BOB },
  { ...trade(GRADUATED, 230, 1, 2300), venue: "pool" },
];

// Quoted in a six decimal asset, and traded in the same seconds as the graduated
// token, so a query that forgot its launch filter would mix them in.
const otherTrades: SeedTrade[] = [
  { ...trade(OTHER, 205, 0, 2050), quoteAmount: 3_000_000n, tokenAmount: 4n * E18 },
  { ...trade(OTHER, 225, 0, 2250), quoteAmount: 1_000_000n, tokenAmount: E18 },
];

export const idOf = (block: number, log: number) =>
  `46630:${block}:${hashOf(block, log)}:${log}`;

// The graduated token's trades as the route must list them: newest first, then the
// later block, then the later log.
export const GRADUATED_ORDER = [
  idOf(230, 1),
  idOf(220, 9),
  idOf(210, 0),
  idOf(202, 5),
  idOf(202, 2),
  idOf(201, 1),
  idOf(200, 4),
  idOf(120, 3),
  idOf(110, 0),
  idOf(101, 1),
  idOf(100, 7),
  idOf(100, 2),
];

interface SeedLaunch {
  token: string;
  name: string;
  symbol: string;
  logo: string;
  quote: string;
  quoteSymbol: string;
  decimals: number;
  graduated: boolean;
  marketCap: bigint;
  curveQuoteReserve: bigint;
  lastBuy: number | null;
  volume: bigint;
  buyCount: number;
  sellCount: number;
  launchedAt: number;
}

// Every launch needs five of its quote asset to graduate.
export const GRADUATION_THRESHOLD = 5n * E18;

const seedLaunch = (
  token: string,
  symbol: string,
  rest: Partial<SeedLaunch> = {},
): SeedLaunch => ({
  token,
  name: symbol,
  symbol,
  logo: "",
  quote: address(0),
  quoteSymbol: "ETH",
  decimals: 18,
  graduated: false,
  marketCap: E18,
  curveQuoteReserve: 0n,
  lastBuy: null,
  volume: 0n,
  buyCount: 0,
  sellCount: 0,
  launchedAt: 900,
  ...rest,
});

// A graduated launch: its pool open and its curve frozen at the threshold.
const graduatedLaunch = (
  token: string,
  symbol: string,
  rest: Partial<SeedLaunch> = {},
): SeedLaunch =>
  seedLaunch(token, symbol, {
    graduated: true,
    curveQuoteReserve: GRADUATION_THRESHOLD,
    lastBuy: 1200,
    volume: E18,
    buyCount: 1,
    ...rest,
  });

// TIED_HIGH is written before TIED_LOW, so a query that forgot its tie break would
// most likely return them in the order written, which is the wrong one.
const launches: SeedLaunch[] = [
  graduatedLaunch(GRADUATED, "GRAD", {
    marketCap: 50n * E18,
    lastBuy: 2300,
    volume: 10n * E18,
    buyCount: 6,
    sellCount: 4,
  }),
  seedLaunch(OTHER, "OTHR", {
    quote: NVDA,
    quoteSymbol: "NVDA",
    decimals: 6,
    marketCap: 30_000_000n,
    curveQuoteReserve: 4_000_000n,
    lastBuy: 2250,
    volume: 4_000_000n,
    buyCount: 2,
  }),
  seedLaunch(UNTRADED, "NEW"),
  graduatedLaunch(TIED_HIGH, "HIGH", {
    name: "Tied High",
    logo: "https://example.com/high.png",
    marketCap: 20n * E18,
  }),
  graduatedLaunch(TIED_LOW, "LOW", {
    name: "Tied Low",
    logo: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    marketCap: 20n * E18,
  }),
  graduatedLaunch(SMALL_CAP, "SMOL", { marketCap: 9n * E18 }),
  seedLaunch(SWEPT, "SWEPT", {
    marketCap: 900n * E18,
    curveQuoteReserve: GRADUATION_THRESHOLD + 1n,
    lastBuy: 1400,
    volume: 6n * E18,
    buyCount: 3,
  }),
  seedLaunch(FRESH_TWIN, "TWIN", {
    marketCap: 3n * E18,
    curveQuoteReserve: 2n * E18,
    launchedAt: LIST_NOW - 2 * HOUR,
    lastBuy: LIST_NOW - 600,
    volume: 3n * E18,
    buyCount: 1,
  }),
  seedLaunch(FRESH, "FRESH", {
    marketCap: 3n * E18,
    curveQuoteReserve: 2n * E18,
    launchedAt: LIST_NOW - 2 * HOUR,
    lastBuy: LIST_NOW - 600,
    volume: 3n * E18,
    buyCount: 1,
  }),
  seedLaunch(REVIVED, "REVI", {
    marketCap: 2n * E18,
    lastBuy: LIST_NOW - HOUR,
    volume: 111n * E18,
    buyCount: 1,
  }),
  seedLaunch(WEEK_OLD, "WEEK", {
    marketCap: 10n * E18,
    launchedAt: LIST_NOW - 3 * DAY,
    lastBuy: LIST_NOW - 2 * DAY,
    volume: 4n * E18,
    buyCount: 1,
  }),
  seedLaunch(BRAND_NEW, "BRAND", { launchedAt: LIST_NOW - 60 }),
  seedLaunch(LAPSED, "LAPSE", {
    marketCap: 4n * E18,
    launchedAt: LIST_NOW - 8 * DAY,
    lastBuy: LIST_NOW - DAY - HOUR,
    volume: 7n * E18,
    buyCount: 1,
  }),
];

// Every launch has a supply of a billion tokens, so a million is a tenth of a percent.
const MILLION = 10n ** 6n * E18;

interface SeedHolder {
  launch: string;
  wallet: string;
  balance: bigint;
  isProtocol: boolean;
}

const holder = (wallet: string, millions: bigint, isProtocol = false) => ({
  launch: GRADUATED,
  wallet,
  balance: millions * MILLION,
  isProtocol,
});

// The graduated token's holders, each protocol holder among them, flagged the way the
// indexer flags them. The creator is ALICE. BOB and CAROL hold the same balance, so
// the wallet settles their order. DAVE sold out and the curve closed, so both sit at
// zero and are never listed. Eleven hold a balance: eight protocol holders and people
// on page one, and three small holders past them.
const graduatedHolders: SeedHolder[] = [
  holder(env.POOL_MANAGER_ADDRESS, 500n, true),
  holder(ALICE, 200n),
  holder(env.LOCKER_ADDRESS, 100n, true),
  holder(env.BUYBACK_VAULT_ADDRESS, 50n, true),
  holder(CAROL, 40n),
  holder(BOB, 40n),
  holder(BURN, 30n, true),
  holder(env.HOOK_ADDRESS, 20n, true),
  holder(DAVE, 0n),
  holder(CURVE, 0n, true),
  ...SMALL.map((wallet) => holder(wallet, 1n)),
];

// The other token's holders include the graduated token's creator with a larger
// balance, so a query that forgot its launch filter would mix them in.
const otherHolders: SeedHolder[] = [
  { launch: OTHER, wallet: ALICE, balance: 900n * MILLION, isProtocol: false },
  { launch: OTHER, wallet: CURVE, balance: 100n * MILLION, isProtocol: true },
];

interface SeedHour {
  launch: string;
  hour: number;
  volume: bigint;
  buyCount: number;
  sellCount: number;
}

const volumeHour = (launch: string, start: number, volume: bigint): SeedHour => ({
  launch,
  hour: start,
  volume,
  buyCount: 1,
  sellCount: 0,
});

// Hourly volume, keyed by each hour's start. The graduated token traded in two hours
// and the other token and SWEPT in one, long ago.
//
// The Explore tokens' hours sit on and around the volume windows, and add up to each
// launch's all time volume. In whole ETH:
//
//   token       24h   7d   all   hours ago traded
//   REVIVED       1   11   111   23, 167, and 168 just outside 7d
//   LAPSED        -    7     7   24 just outside 24h, and 25
//   WEEK_OLD      -    4     4   48
//   FRESH         3    3     3   0 and 1
//   FRESH_TWIN    3    3     3   0 and 1
//
// REVIVED's 11 and 111 have more digits than FRESH's 3 and a smaller first digit, so a
// sort on text rather than number puts them after. TIED_HIGH has graduated, and traded
// this hour, so a volume query that forgot the curve filter would list it.
const hours: SeedHour[] = [
  { launch: GRADUATED, hour: 0, volume: 4n * E18, buyCount: 3, sellCount: 1 },
  { launch: GRADUATED, hour: 3600, volume: 6n * E18, buyCount: 3, sellCount: 3 },
  { launch: OTHER, hour: 0, volume: 4_000_000n, buyCount: 2, sellCount: 0 },
  volumeHour(SWEPT, 0, 6n * E18),
  volumeHour(REVIVED, hoursAgo(23), E18),
  volumeHour(REVIVED, hoursAgo(167), 10n * E18),
  volumeHour(REVIVED, hoursAgo(168), 100n * E18),
  volumeHour(LAPSED, hoursAgo(24), 5n * E18),
  volumeHour(LAPSED, hoursAgo(25), 2n * E18),
  volumeHour(WEEK_OLD, hoursAgo(48), 4n * E18),
  volumeHour(FRESH, hoursAgo(0), 2n * E18),
  volumeHour(FRESH, hoursAgo(1), E18),
  volumeHour(FRESH_TWIN, hoursAgo(1), E18),
  volumeHour(FRESH_TWIN, hoursAgo(0), 2n * E18),
  volumeHour(TIED_HIGH, hoursAgo(0), E18),
];

const TABLES = ["launch", "trade", "launch_hour", "holder"];

// Ponder's DDL for the four tables the backend reads, in one sha schema, as the
// indexer lays them out at commit 8cfd08c, less the trigram search indexes, which need
// the pg_trgm extension and change no answer.
const createTables = (schema: string) => `
  CREATE SCHEMA ${schema};
  CREATE TYPE ${schema}.venue AS ENUM ('curve', 'pool');
  CREATE TYPE ${schema}.side AS ENUM ('buy', 'sell');
  CREATE TYPE ${schema}.trade_kind AS ENUM ('user', 'buyback', 'fee_conversion');
  CREATE TYPE ${schema}.fee_asset AS ENUM ('quote_asset', 'launch_token');

  CREATE TABLE ${schema}.launch (
    token text PRIMARY KEY,
    chain_id integer NOT NULL,
    curve text NOT NULL,
    creator text NOT NULL,
    quote_asset text NOT NULL,
    quote_asset_symbol text NOT NULL,
    quote_asset_decimals integer NOT NULL,
    launch_config_id numeric(78,0) NOT NULL,
    graduation_threshold numeric(78,0) NOT NULL,
    name text NOT NULL,
    symbol text NOT NULL,
    logo text NOT NULL,
    description text NOT NULL,
    twitter text,
    telegram text,
    discord text,
    website text,
    farcaster text,
    creator_tax_bps integer NOT NULL,
    total_supply numeric(78,0) NOT NULL,
    supply numeric(78,0) NOT NULL,
    market_cap numeric(78,0) NOT NULL,
    curve_quote_reserve numeric(78,0) NOT NULL,
    last_buy_timestamp numeric(78,0),
    volume numeric(78,0) NOT NULL,
    buy_count integer NOT NULL,
    sell_count integer NOT NULL,
    launch_block numeric(78,0) NOT NULL,
    launch_timestamp numeric(78,0) NOT NULL,
    launch_transaction_hash text NOT NULL,
    graduated boolean NOT NULL,
    graduation_block numeric(78,0),
    graduation_timestamp numeric(78,0),
    graduation_transaction_hash text,
    pool_id text
  );
  CREATE INDEX ON ${schema}.launch (market_cap);
  CREATE INDEX ON ${schema}.launch (last_buy_timestamp);
  CREATE INDEX ON ${schema}.launch (launch_timestamp);
  CREATE INDEX ON ${schema}.launch (volume);
  CREATE INDEX ON ${schema}.launch (creator, launch_timestamp DESC NULLS FIRST, token);

  CREATE TABLE ${schema}.trade (
    id text PRIMARY KEY,
    chain_id integer NOT NULL,
    launch text NOT NULL,
    venue ${schema}.venue NOT NULL,
    kind ${schema}.trade_kind NOT NULL,
    side ${schema}.side NOT NULL,
    trader text NOT NULL,
    launch_token_amount numeric(78,0) NOT NULL,
    quote_amount numeric(78,0) NOT NULL,
    fee numeric(78,0) NOT NULL,
    creator_tax numeric(78,0) NOT NULL,
    fee_asset ${schema}.fee_asset NOT NULL,
    block_number numeric(78,0) NOT NULL,
    "timestamp" numeric(78,0) NOT NULL,
    transaction_hash text NOT NULL,
    log_index integer NOT NULL
  );
  CREATE INDEX ON ${schema}.trade (launch, "timestamp");

  CREATE TABLE ${schema}.launch_hour (
    launch text NOT NULL,
    hour numeric(78,0) NOT NULL,
    volume numeric(78,0) NOT NULL,
    buy_count integer NOT NULL,
    sell_count integer NOT NULL,
    PRIMARY KEY (launch, hour)
  );
  CREATE INDEX ON ${schema}.launch_hour (hour);

  CREATE TABLE ${schema}.holder (
    launch text NOT NULL,
    wallet text NOT NULL,
    balance numeric(78,0) NOT NULL,
    is_protocol boolean NOT NULL,
    PRIMARY KEY (launch, wallet)
  );
`;

const seed = async (db: pg.Pool, schema: string) => {
  for (const launch of launches) {
    const row: Record<string, unknown> = {
      token: launch.token,
      chain_id: 46630,
      curve: CURVE,
      creator: ALICE,
      quote_asset: launch.quote,
      quote_asset_symbol: launch.quoteSymbol,
      quote_asset_decimals: launch.decimals,
      launch_config_id: 1,
      graduation_threshold: GRADUATION_THRESHOLD.toString(),
      name: launch.name,
      symbol: launch.symbol,
      logo: launch.logo,
      description: "",
      creator_tax_bps: 100,
      total_supply: (10n ** 9n * E18).toString(),
      supply: (10n ** 9n * E18).toString(),
      market_cap: launch.marketCap.toString(),
      curve_quote_reserve: launch.curveQuoteReserve.toString(),
      last_buy_timestamp: launch.lastBuy,
      volume: launch.volume.toString(),
      buy_count: launch.buyCount,
      sell_count: launch.sellCount,
      launch_block: 50,
      launch_timestamp: launch.launchedAt,
      launch_transaction_hash: hashOf(50, 0),
      graduated: launch.graduated,
      graduation_block: launch.graduated ? 150 : null,
      graduation_timestamp: launch.graduated ? 1500 : null,
      graduation_transaction_hash: launch.graduated ? hashOf(150, 0) : null,
      pool_id: launch.graduated ? `0x${"ee".repeat(32)}` : null,
    };
    const columns = Object.keys(row);

    await db.query(
      `INSERT INTO ${schema}.launch (${columns.join(", ")})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(row),
    );
  }

  for (const h of hours)
    await db.query(`INSERT INTO ${schema}.launch_hour VALUES ($1, $2, $3, $4, $5)`, [
      h.launch,
      h.hour,
      h.volume.toString(),
      h.buyCount,
      h.sellCount,
    ]);

  for (const t of [...graduatedTrades, ...otherTrades])
    await db.query(
      `INSERT INTO ${schema}.trade VALUES
        ($1, 46630, $2, $3, $4, $5, $6, $7, $8, 0, 0, 'quote_asset', $9, $10, $11, $12)`,
      [
        idOf(t.block, t.log),
        t.launch,
        t.venue,
        t.kind,
        t.side,
        t.trader,
        t.tokenAmount.toString(),
        t.quoteAmount.toString(),
        t.block,
        t.timestamp,
        hashOf(t.block, t.log),
        t.log,
      ],
    );

  for (const h of [...graduatedHolders, ...otherHolders])
    await db.query(`INSERT INTO ${schema}.holder VALUES ($1, $2, $3, $4)`, [
      h.launch,
      h.wallet,
      h.balance.toString(),
      h.isProtocol,
    ]);
};

// What Ponder does when a deploy has caught up: drop each view in indexer and create it
// again over the new sha schema. The indexer schema itself is kept.
const pointViews = async (db: pg.Pool, schema: string) => {
  await db.query(`CREATE SCHEMA IF NOT EXISTS indexer`);

  for (const table of TABLES) {
    await db.query(`DROP VIEW IF EXISTS indexer.${table}`);
    await db.query(`CREATE VIEW indexer.${table} AS SELECT * FROM ${schema}.${table}`);
  }
};

// One indexer deploy: a fresh sha schema, seeded, with the views moved onto it.
export const deployIndexer = async (db: pg.Pool, sha: string) => {
  const schema = `indexer_${sha}`;

  await db.query(createTables(schema));
  await seed(db, schema);
  await pointViews(db, schema);
};

export const dropIndexer = async (db: pg.Pool) => {
  const { rows } = await db.query<{ name: string }>(
    `SELECT nspname AS name FROM pg_namespace WHERE nspname = 'indexer' OR nspname LIKE 'indexer\\_%'`,
  );

  for (const { name } of rows)
    await db.query(`DROP SCHEMA ${pg.escapeIdentifier(name)} CASCADE`);
};

// sql/indexer-read-only-user.sql is written for psql. Its variables are
// filled in here the way psql fills them, so the suite runs the very file an operator
// runs.
export const createReader = async (db: pg.Pool, role: string, password: string) => {
  const owner = (await db.query<{ owner: string }>("SELECT current_user AS owner"))
    .rows[0].owner;

  const script = readFileSync("sql/indexer-read-only-user.sql", "utf8")
    .replaceAll(`:"role"`, pg.escapeIdentifier(role))
    .replaceAll(`:"owner"`, pg.escapeIdentifier(owner))
    .replaceAll(`:'password'`, pg.escapeLiteral(password));

  await db.query(script);
};

export const dropReader = async (db: pg.Pool, role: string) => {
  const exists = await db.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  if (!exists.rowCount) return;

  const name = pg.escapeIdentifier(role);
  await db.query(`DROP OWNED BY ${name}`);
  await db.query(`DROP ROLE ${name}`);
};

export const readerUrl = (role: string, password: string) => {
  const reader = new URL(url);
  reader.username = role;
  reader.password = password;
  return reader.toString();
};
