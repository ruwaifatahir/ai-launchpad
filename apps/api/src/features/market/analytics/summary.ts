import { formatUnits } from "viem";
import { env } from "@/config/env";
import {
  type VolumeDayRow,
  countCreators,
  findLaunchDays,
  findVolumeDays,
} from "@/features/market/analytics/analytics.repo";
import { cachedAnalytics } from "@/features/market/cache";
import { findDailyRates } from "@/features/market/daily-rates/daily-rates.repo";
import { DAY, daysFrom, lastFullDay } from "@/features/market/days";
import { feedsHere } from "@/features/market/dollar-rates/feeds";

// One UTC day's figures. volumeUsd is null while dollar rates are off, and for a day a
// quote asset with a feed traded on but has no stored rate for.
export interface DayFigures {
  day: number;
  launches: number;
  volumeUsd: number | null;
}

export interface Analytics {
  lastFullDay: number | null;
  totals: {
    launches: number;
    creators: number;
    volumeUsd: number | null;
    averageDailyVolumeUsd: number | null;
    unpricedDays: number;
  };
  lastDay: DayFigures | null;
  priorDay: DayFigures | null;
  series: DayFigures[];
  unpricedQuoteAssets: { address: string; symbol: string }[];
}

// While a day waits for its rate, the answer is held this long, so a rate the job
// fills shows up soon after.
const UNPRICED_TTL_SECONDS = 5 * 60;

const keyOf = (quoteAsset: string, day: number) => `${quoteAsset}:${day}`;

// Every stored rate from first to last, as dollars per whole unit of the quote asset,
// by quote asset and day.
const readRates = async (first: number, last: number) => {
  const rows = await findDailyRates(env.CHAIN_ID, first, last);

  return new Map(
    rows.map((row) => [
      keyOf(row.quoteAsset, row.day),
      Number(formatUnits(BigInt(row.answer), row.decimals)),
    ]),
  );
};

// A day's volume in dollars, each quote asset at that day's rate. A quote asset with a
// feed and no rate for the day leaves the whole day unpriced. One with no feed at all
// is left out, and named in unpriced, since no day of it will ever be priced. Every row
// is read even once the day is unpriced, so no such asset goes unnamed.
const priceDay = (
  rows: VolumeDayRow[],
  rates: ReadonlyMap<string, number>,
  feeds: Readonly<Record<string, string>>,
  unpriced: Map<string, string>,
) => {
  let total: number | null = 0;

  for (const row of rows) {
    const rate = rates.get(keyOf(row.quoteAddress, row.day));

    if (rate === undefined) {
      if (feeds[row.quoteAddress]) total = null;
      else unpriced.set(row.quoteAddress, row.quoteSymbol);
    } else if (total !== null) {
      total += Number(formatUnits(BigInt(row.volume), row.quoteDecimals)) * rate;
    }
  }

  return total;
};

const EMPTY: Omit<Analytics, "totals"> = {
  lastFullDay: null,
  lastDay: null,
  priorDay: null,
  series: [],
  unpricedQuoteAssets: [],
};

// Every figure counted to the end of lastDay: each day's launches and volume from the
// first launch's day, the distinct creators, and the totals over them.
const readSummary = async (lastDay: number): Promise<Analytics> => {
  const until = lastDay + DAY;
  const [launchDays, volumeDays, creators] = await Promise.all([
    findLaunchDays(until),
    findVolumeDays(until),
    countCreators(until),
  ]);

  const feeds = feedsHere();
  const ratesOn = Object.keys(feeds).length > 0;

  if (launchDays.length === 0)
    return {
      ...EMPTY,
      totals: {
        launches: 0,
        creators: 0,
        volumeUsd: ratesOn ? 0 : null,
        averageDailyVolumeUsd: ratesOn ? 0 : null,
        unpricedDays: 0,
      },
    };

  const days = daysFrom(launchDays[0].day, lastDay);
  const rates = ratesOn ? await readRates(days[0], lastDay) : new Map<string, number>();

  const launchesOn = new Map(launchDays.map((row) => [row.day, row.launches]));
  const volumeOn = new Map<number, VolumeDayRow[]>();
  for (const row of volumeDays)
    volumeOn.set(row.day, [...(volumeOn.get(row.day) ?? []), row]);
  const unpriced = new Map<string, string>();

  const series = days.map((day) => ({
    day,
    launches: launchesOn.get(day) ?? 0,
    volumeUsd: ratesOn ? priceDay(volumeOn.get(day) ?? [], rates, feeds, unpriced) : null,
  }));

  const priced = series.flatMap((day) => (day.volumeUsd === null ? [] : [day.volumeUsd]));
  const volumeUsd = ratesOn ? priced.reduce((sum, day) => sum + day, 0) : null;

  return {
    lastFullDay: lastDay,
    totals: {
      launches: series.reduce((sum, day) => sum + day.launches, 0),
      creators,
      volumeUsd,
      averageDailyVolumeUsd: volumeUsd === null ? null : volumeUsd / series.length,
      unpricedDays: ratesOn ? series.length - priced.length : 0,
    },
    lastDay: series.at(-1) ?? null,
    priorDay: series.at(-2) ?? null,
    series,
    unpricedQuoteAssets: [...unpriced]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([address, symbol]) => ({ address, symbol })),
  };
};

// Held until the next midnight UTC, when a new day closes. While any day waits for its
// rate it is held five minutes instead.
export const readAnalytics = () => {
  const lastDay = lastFullDay();

  const ttlSeconds = (analytics: Analytics) => {
    const toMidnight = Math.max(1, Math.ceil(lastDay + 2 * DAY - Date.now() / 1000));

    return analytics.totals.unpricedDays > 0
      ? Math.min(UNPRICED_TTL_SECONDS, toMidnight)
      : toMidnight;
  };

  return cachedAnalytics(lastDay, ttlSeconds, () => readSummary(lastDay));
};
