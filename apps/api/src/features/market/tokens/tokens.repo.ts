import type { DollarRates } from "@/features/market/dollar-rates/reading";
import { readIndexer } from "@/lib/indexer/client";

// Every token ever launched, graduated or not.
export const countLaunches = async () => {
  const [counts] = await readIndexer<{ total: number }>(
    "lists",
    `SELECT count(*)::int AS total
     FROM indexer.launch`,
    [],
  );

  return counts.total;
};

// Every order a token list offers. The request schemas each offer some of them, and
// the compiler holds each schema to this set where its domain passes a sort here.
type ListOrder =
  "relevance" | "recent-buys" | "market-cap" | "volume" | "newest" | "oldest";

// Which tokens a list keeps. graduated is true for the graduated list, false for the
// tokens on their curve, and null for both. q is trimmed and lowercased, and empty for
// every token. quote is a lowercase quote asset address, or null for every quote asset.
// creator is a lowercase wallet address, or null for every creator.
// since is a unix second, or null for every token. What it measures is the sort's to
// say: the last buy under recent-buys, the hours summed under volume, and the launch
// under the rest.
export interface ListFilter {
  sort: ListOrder;
  since: number | null;
  graduated: boolean | null;
  q: string;
  quote: string | null;
  creator: string | null;
}

// A launch as a token list shows it. Amounts are numeric in the indexer and leave as
// text, so they stay exact. The two timestamps are unix seconds, which a float holds
// exactly, so they leave as numbers. Addresses are lowercase, as the indexer writes
// them. Under the volume sort alone a launch carries its volume over the window.
export interface ListedLaunchRow {
  token: string;
  name: string;
  symbol: string;
  logo: string;
  creator: string;
  marketCap: string;
  quoteAddress: string;
  quoteSymbol: string;
  quoteDecimals: number;
  curveQuoteReserve: string;
  graduationThreshold: string;
  graduated: boolean;
  launchedAt: number;
  lastBuyAt: number | null;
  volume?: string;
}

// Every token list selects these, so the lists cannot drift apart in what they serve.
const LISTED_COLUMNS = `
  launch.token,
  launch.name,
  launch.symbol,
  launch.logo,
  launch.creator,
  launch.market_cap::text AS "marketCap",
  launch.quote_asset AS "quoteAddress",
  launch.quote_asset_symbol AS "quoteSymbol",
  launch.quote_asset_decimals AS "quoteDecimals",
  launch.curve_quote_reserve::text AS "curveQuoteReserve",
  launch.graduation_threshold::text AS "graduationThreshold",
  launch.graduated,
  launch.launch_timestamp::float8 AS "launchedAt",
  launch.last_buy_timestamp::float8 AS "lastBuyAt"`;

// A full address is matched against the token address alone. Anything shorter is text.
const FULL_ADDRESS = /^0x[0-9a-f]{40}$/;

// q as literal text inside an ILIKE pattern. Its %, _ and the escape character itself
// each gain a backslash, so they match themselves. Every pattern names the backslash as
// its escape outright, rather than trusting the server's default.
const likeText = (q: string) => q.replace(/[\\%_]/g, "\\$&");
const ESCAPE = "ESCAPE '\\'";

// Binds values to numbered parameters in the order the SQL names them, so a query built
// from optional pieces never skips or reuses a number. bind returns the value's
// placeholder, such as $2.
type Bind = (value: unknown) => string;

const parameters = (): { values: unknown[]; bind: Bind } => {
  const values: unknown[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  return { values, bind };
};

// Where the volume sort reads each token's volume. With no window it is the launch's
// all time volume. With one it is launch_hour summed over every hour starting at or
// after the window's start. The indexer counts whole hours, so the hour the window
// opens in is missed. The start is always a parameter, so the indexer's index on
// launch_hour.hour stays usable.
const volumeSource = (since: number | null, bind: Bind) =>
  since === null
    ? { from: "indexer.launch", volume: "launch.volume" }
    : {
        from: `indexer.launch
     JOIN (
       SELECT launch_hour.launch, sum(launch_hour.volume) AS volume
       FROM indexer.launch_hour
       WHERE launch_hour.hour >= ${bind(since)}::numeric
       GROUP BY launch_hour.launch
     ) AS windowed ON windowed.launch = launch.token`,
        volume: "windowed.volume",
      };

// Where a list reads from and which tokens it keeps. Only fixed strings and bound
// parameter names reach the SQL: a request's text is always a bound value. The window
// is written in only when there is one, so the indexer's index on the windowed column
// stays usable.
//
// The indexer marks a launch graduated when its pool opens, the second of graduation's
// two transactions. A launch whose curve has closed but whose pool has not opened is
// still on its curve, for the few seconds between the two.
const listSource = (filter: ListFilter, bind: Bind) => {
  const clauses: string[] = [];
  let from = "indexer.launch";
  let volume: string | null = null;

  if (filter.graduated !== null)
    clauses.push(filter.graduated ? "launch.graduated" : "NOT launch.graduated");

  if (filter.sort === "volume") {
    ({ from, volume } = volumeSource(filter.since, bind));
    clauses.push(`${volume} > 0`);
  } else if (filter.sort === "recent-buys") {
    clauses.push("launch.last_buy_timestamp IS NOT NULL");
    if (filter.since !== null)
      clauses.push(`launch.last_buy_timestamp >= ${bind(filter.since)}::numeric`);
  } else if (filter.since !== null) {
    clauses.push(`launch.launch_timestamp >= ${bind(filter.since)}::numeric`);
  }

  if (FULL_ADDRESS.test(filter.q)) {
    clauses.push(`launch.token = ${bind(filter.q)}`);
  } else if (filter.q) {
    const contains = bind(`%${likeText(filter.q)}%`);
    clauses.push(
      `(launch.name ILIKE ${contains} ${ESCAPE} OR launch.symbol ILIKE ${contains} ${ESCAPE})`,
    );
  }

  if (filter.quote !== null) clauses.push(`launch.quote_asset = ${bind(filter.quote)}`);

  if (filter.creator !== null) clauses.push(`launch.creator = ${bind(filter.creator)}`);

  return { from, volume, where: clauses.length ? clauses.join(" AND ") : "true" };
};

// Relevance ranks an exact ticker, then a name or ticker starting with q, then one
// containing it. A full address matches one token, so it has no rank to take: it is
// first by being the only one. An empty q ranks nothing, and relevance is market cap.
const relevanceRank = (q: string, bind: Bind) => {
  if (!q || FULL_ADDRESS.test(q)) return null;

  const exact = bind(likeText(q));
  const prefix = bind(`${likeText(q)}%`);

  return `CASE
       WHEN launch.symbol ILIKE ${exact} ${ESCAPE} THEN 0
       WHEN launch.name ILIKE ${prefix} ${ESCAPE} OR launch.symbol ILIKE ${prefix} ${ESCAPE} THEN 1
       ELSE 2
     END`;
};

// The dollar rates as a table the list joins on each launch's quote asset, one row per
// quote asset priced. A launch whose quote asset has no rate joins nothing, so its
// figures in dollars are null.
const rateJoin = (rates: DollarRates, bind: Bind) => {
  const rows = [...rates].map(
    ([quote, usd]) => `(${bind(quote)}::text, ${bind(usd)}::numeric)`,
  );

  return `
     LEFT JOIN (VALUES ${rows.join(", ")}) AS rate(quote_asset, usd)
       ON rate.quote_asset = launch.quote_asset`;
};

// An amount in the quote asset's raw units, in whole dollars.
const inDollars = (amount: string) =>
  `(${amount} * rate.usd / (10::numeric ^ launch.quote_asset_decimals))`;

// Largest first. With rates the amount is ranked in dollars, so tokens on different quote
// assets compare fairly, and a token whose quote asset has no rate comes after every one
// that has. Ties, and every token without a rate, fall back to the raw amount.
const largestFirst = (amount: string, dollars: boolean) =>
  dollars
    ? `${inDollars(amount)} DESC NULLS LAST, ${amount} DESC, launch.token`
    : `${amount} DESC, launch.token`;

// Each order names launch's own numeric columns, because the text columns this query
// selects would sort 9 above 10, and ends on the token address, so a token keeps its
// page between polls.
const listOrder = (
  filter: ListFilter,
  volume: string | null,
  dollars: boolean,
  bind: Bind,
) => {
  const byMarketCap = largestFirst("launch.market_cap", dollars);

  switch (filter.sort) {
    case "relevance": {
      const rank = relevanceRank(filter.q, bind);
      return rank === null ? byMarketCap : `${rank}, ${byMarketCap}`;
    }
    case "recent-buys":
      return "launch.last_buy_timestamp DESC, launch.token";
    case "market-cap":
      return byMarketCap;
    case "volume":
      // listSource always names a volume under this sort. The fallback is the one it
      // names with no window, so the compiler needs no promise from us.
      return largestFirst(volume ?? "launch.volume", dollars);
    case "newest":
      return "launch.launch_timestamp DESC, launch.token";
    case "oldest":
      return "launch.launch_timestamp, launch.token";
  }
};

export const countListedLaunches = async (filter: ListFilter) => {
  const { values, bind } = parameters();
  const { from, where } = listSource(filter, bind);
  const [counts] = await readIndexer<{ total: number }>(
    "lists",
    `SELECT count(*)::int AS total
     FROM ${from}
     WHERE ${where}`,
    values,
  );

  return counts.total;
};

// rates ranks market cap and volume in dollars. Empty ranks the raw amounts.
export const findListedLaunches = (
  filter: ListFilter,
  window: { limit: number; offset: number },
  rates: DollarRates,
) => {
  const { values, bind } = parameters();
  const { from, where, volume } = listSource(filter, bind);
  const dollars = rates.size > 0;
  const joined = dollars ? `${from}${rateJoin(rates, bind)}` : from;
  const order = listOrder(filter, volume, dollars, bind);
  const volumeColumn = volume === null ? "" : `,\n       ${volume}::text AS "volume"`;

  return readIndexer<ListedLaunchRow>(
    "lists",
    `SELECT ${LISTED_COLUMNS}${volumeColumn}
     FROM ${joined}
     WHERE ${where}
     ORDER BY ${order}
     LIMIT ${bind(window.limit)} OFFSET ${bind(window.offset)}`,
    values,
  );
};
