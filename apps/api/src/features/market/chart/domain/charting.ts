import { cachedMarketRead } from "@/features/market/cache";
import { readDollarRate } from "@/features/market/dollar-rates/reading";
import { requireLaunch } from "@/features/market/launches/lookup";
import { TOKEN_DECIMALS, type TradeAmounts, priceOf } from "@/features/market/pricing";
import type { ChartRange, ChartRequest } from "@/features/market/chart/domain/schema";
import {
  findChartBuckets,
  findLastTradeAtOrBefore,
} from "@/features/market/chart/chart.repo";

// How far back each range reaches and how wide its buckets are, in seconds. These are
// the sizes Pons's own chart uses, read from its live API on 2026-09-26. all reaches
// back to the token's first trade.
const RANGES: Record<ChartRange, { span: number | null; bucketSeconds: number }> = {
  "5m": { span: 5 * 60, bucketSeconds: 15 },
  "1h": { span: 60 * 60, bucketSeconds: 15 },
  "6h": { span: 6 * 60 * 60, bucketSeconds: 60 },
  "1d": { span: 24 * 60 * 60, bucketSeconds: 5 * 60 },
  all: { span: null, bucketSeconds: 60 * 60 },
};

// The latest price over the opening one, as a percentage. Null when either is missing,
// which is a token with no trade at all, or when the opening price is zero, which a
// trade cannot set.
const percentChange = (latest: number | null, opening: number | null) =>
  latest === null || opening === null || opening === 0
    ? null
    : (latest / opening - 1) * 100;

const readChart = async ({ params, query }: Pick<ChartRequest, "params" | "query">) => {
  const launch = await requireLaunch(params.token);

  const { span, bucketSeconds } = RANGES[query.range];
  const from = span === null ? 0 : Math.floor(Date.now() / 1000) - span;

  const [buckets, openingTrade, quoteUsd] = await Promise.all([
    findChartBuckets(params.token, { from, bucketSeconds }),
    span === null ? null : findLastTradeAtOrBefore(params.token, from),
    readDollarRate(launch.quoteAddress),
  ]);

  const price = (trade: TradeAmounts) => priceOf(trade, launch.quoteDecimals);

  const points = buckets.map((bucket) => ({
    t: Number(bucket.t),
    price: price(bucket),
    volume: Number(bucket.volume) / 10 ** launch.quoteDecimals,
    tradeCount: bucket.tradeCount,
  }));

  // The price when the range began is the last trade at or before its start. A token
  // that first traded inside the range opens at its first price there. With no trade in
  // the range the price has not moved since the one before it.
  const opening = openingTrade ? price(openingTrade) : (points[0]?.price ?? null);
  const latest = points.at(-1)?.price ?? opening;

  return {
    range: query.range,
    bucketSeconds,
    tokenDecimals: TOKEN_DECIMALS,
    supply: launch.supply,
    quoteDecimals: launch.quoteDecimals,
    quoteSymbol: launch.quoteSymbol,
    // The Panel's figures in dollars are its own prices times this. Null for none.
    quoteUsd,
    change: percentChange(latest, opening),
    points,
  };
};

export const chartToken = (request: Pick<ChartRequest, "params" | "query">) =>
  cachedMarketRead("chart", request.params.token, request.query.range, () =>
    readChart(request),
  );
