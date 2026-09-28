import { DAY } from "@/features/market/days";
import { readIndexer } from "@/lib/indexer/client";

// Every read here counts what happened before until, a unix second, which is the end
// of the last full UTC day. The indexer keys launch_hour by UTC hour starts, so 24 of
// them make a day exactly, and a day is its first second, worked out in the query.

// When the first token launched, in unix seconds. Null before any launch.
export const findFirstLaunchAt = async () => {
  const [first] = await readIndexer<{ at: number | null }>(
    "lists",
    `SELECT min(launch_timestamp)::float8 AS at
     FROM indexer.launch`,
    [],
  );

  return first.at;
};

// The launches of each day with any, oldest first.
export const findLaunchDays = (until: number) =>
  readIndexer<{ day: number; launches: number }>(
    "lists",
    `SELECT (floor(launch_timestamp / ${DAY}) * ${DAY})::float8 AS day,
            count(*)::int AS launches
     FROM indexer.launch
     WHERE launch_timestamp < $1::numeric
     GROUP BY 1
     ORDER BY 1`,
    [until],
  );

// The wallets that have launched a token, each once.
export const countCreators = async (until: number) => {
  const [counts] = await readIndexer<{ creators: number }>(
    "lists",
    `SELECT count(DISTINCT creator)::int AS creators
     FROM indexer.launch
     WHERE launch_timestamp < $1::numeric`,
    [until],
  );

  return counts.creators;
};

// One day's volume in one quote asset, a raw integer string in its decimals. The
// address is lowercase, as the indexer writes it.
export interface VolumeDayRow {
  day: number;
  quoteAddress: string;
  quoteSymbol: string;
  quoteDecimals: number;
  volume: string;
}

// The volume of each day with any, by quote asset. launch_hour counts user trades
// alone, so buybacks and fee conversions are never in it. The indexer copies one
// symbol and decimals onto every launch of a quote asset. Should two launches ever
// disagree, each keeps its own row, so no amount is scaled by another's decimals.
export const findVolumeDays = (until: number) =>
  readIndexer<VolumeDayRow>(
    "lists",
    `SELECT (floor(launch_hour.hour / ${DAY}) * ${DAY})::float8 AS day,
            launch.quote_asset AS "quoteAddress",
            launch.quote_asset_symbol AS "quoteSymbol",
            launch.quote_asset_decimals AS "quoteDecimals",
            sum(launch_hour.volume)::text AS volume
     FROM indexer.launch_hour
     JOIN indexer.launch ON launch.token = launch_hour.launch
     WHERE launch_hour.hour < $1::numeric
     GROUP BY 1, 2, 3, 4
     ORDER BY 1, 2`,
    [until],
  );
