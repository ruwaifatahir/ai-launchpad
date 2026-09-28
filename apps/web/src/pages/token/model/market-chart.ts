import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Address } from 'viem';
import { formatCompactAmount, formatCompactDollars, formatPairAmount, fromRawAmount, useNow } from '@/shared/lib';
import { marketChartQuery, type ChartPoint, type ChartResponse } from '../api/market-chart';
import type { ChartRange } from '../config/chart-ranges';
import { MARKET_REFRESH_MS } from '../config/refresh';
import { pendingMarketQuery, type MarketQueryPending } from './market-query';

/** How far back each range reaches, in seconds, as the route measures it. `all` starts at the first trade. */
const RANGE_SECONDS: Record<ChartRange, number | null> = {
  '5m': 5 * 60,
  '1h': 60 * 60,
  '6h': 6 * 60 * 60,
  '1d': 24 * 60 * 60,
  all: null,
};

/** A point on the line the cursor rests on: the range's opening, a trade bucket, or now. */
export type ChartMark = {
  /** Unix seconds: the opening, or the bucket's start. `'now'` for now. */
  t: number | 'now';
  x: number;
  y: number;
  /** Written as the headline is, e.g. `$8.07M` or `3,000 ETH`. */
  marketCap: string;
  /** e.g. `Sep 11, 10:00 PM`, to the second on 5m, or `Now`. */
  time: string;
};

/** The chart drawn in SVG user units, on a canvas `CHART_WIDTH` wide. */
export type ChartGeometry = {
  /** SVG viewBox height. */
  height: number;
  /** Edges of the plotted series, used to close the area fill under the line. */
  plot: { left: number; right: number; top: number; bottom: number };
  /** SVG path data of the market cap line. */
  line: string;
  live: { x: number; y: number };
  /** Where the cursor can rest, left to right, ending at now: each vertex of the line. */
  marks: ChartMark[];
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string }[];
};

export type ChartChange = { text: string; direction: 'up' | 'down' | 'flat' };

export type MarketChart =
  /** `empty` is no trade in the range, or a token the indexer has not reached yet. */
  | MarketQueryPending
  | {
      status: 'ready';
      /** Latest market cap: in dollars at the Dollar rate, e.g. `$8.07M`, or with its quote symbol without one, e.g. `3,000 ETH`. */
      marketCap: string;
      /** `null` when the route sends no change. */
      change: ChartChange | null;
      chart: ChartGeometry;
    };

export const CHART_WIDTH = 640;
const HEIGHT = 248;
const PLOT = { left: 4, right: 568, top: 24, bottom: 212 };
const X_TICK_COUNT = 4;
const Y_TICK_TARGET = 3;

const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const clockSeconds = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dayHour = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric' });
const markTime = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const markTimeSeconds = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

/** From here up the headline is written compactly, `65.61M`; below it in full, `3,000`. */
const COMPACT_HEADLINE_FROM = 100_000;

/** How a market cap is written: in dollars at the Dollar rate, or in the Paired asset without one. */
type Denomination = {
  /** What one Paired asset unit counts for: the Dollar rate, or one. */
  rate: number;
  headline: (value: number) => string;
  tick: (value: number) => string;
};

const formatHeadline = (value: number) =>
  value >= COMPACT_HEADLINE_FROM ? formatCompactAmount(value) : formatPairAmount(value);

function denomination(rate: number | null, pairSymbol: string): Denomination {
  return rate === null
    ? { rate: 1, headline: (value) => `${formatHeadline(value)} ${pairSymbol}`, tick: formatCompactAmount }
    : { rate, headline: (value) => `$${formatHeadline(value)}`, tick: formatCompactDollars };
}

function formatChange(change: number): ChartChange {
  const text = `${Math.abs(change).toFixed(2)}%`;
  if (change > 0) return { text: `+${text}`, direction: 'up' };
  if (change < 0) return { text: `-${text}`, direction: 'down' };
  return { text, direction: 'flat' };
}

const round = (value: number) => Math.round(value * 100) / 100;

/** 1, 2 or 5 times a power of ten, at least `raw`. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

function timeLabel(seconds: number, spanSeconds: number): string {
  const date = new Date(seconds * 1000);
  // Across a few days, ticks share dates, so each also says the hour.
  if (spanSeconds > 86_400 * X_TICK_COUNT) return day.format(date);
  if (spanSeconds > 86_400) return dayHour.format(date);
  return (spanSeconds < 600 ? clockSeconds : clock).format(date);
}

/**
 * Draws market cap, price times the current supply at the denomination's rate, over time. A range with an opening price starts
 * there at the range's start, so the line rises or falls by the % change shown beside it; `all`
 * starts at the first trade. Then each bucket at its start, and the last price carried flat to now,
 * since no trade since then has moved it.
 */
function drawChart(
  points: ChartPoint[],
  opening: { t: number; price: number } | null,
  capOf: (price: number) => number,
  unit: Denomination,
  timeFormat: Intl.DateTimeFormat,
  nowS: number,
): ChartGeometry {
  const series = opening ? [opening, ...points] : points;
  const start = series[0]!.t;
  const end = Math.max(nowS, series.at(-1)!.t);
  const span = end - start;
  const x = (t: number) => (span > 0 ? round(PLOT.left + ((t - start) / span) * (PLOT.right - PLOT.left)) : PLOT.left);

  const caps = series.map((point) => capOf(point.price));
  let min = Infinity;
  let max = -Infinity;
  for (const cap of caps) {
    if (cap < min) min = cap;
    if (cap > max) max = cap;
  }
  const pad = max > min ? (max - min) * 0.1 : max * 0.05 || 1;
  const low = Math.max(0, min - pad);
  const high = max + pad;
  const y = (cap: number) => round(PLOT.bottom - ((cap - low) / (high - low)) * (PLOT.bottom - PLOT.top));

  const vertices: ChartMark[] = series.map((point, index) => ({
    t: point.t,
    x: x(point.t),
    y: y(caps[index]!),
    marketCap: unit.headline(caps[index]!),
    time: timeFormat.format(new Date(point.t * 1000)),
  }));
  const last = vertices.at(-1)!;
  const live = { x: PLOT.right, y: last.y };
  vertices.push({ ...live, t: 'now', marketCap: last.marketCap, time: 'Now' });
  const line = vertices.map((vertex, index) => `${index === 0 ? 'M' : 'L'} ${vertex.x} ${vertex.y}`).join(' ');
  // An opening that shares the first bucket's start, when that bucket began before the range, is
  // the same moment, so the cursor rests only on the bucket's own price.
  const marks = opening && opening.t === points[0]!.t ? vertices.slice(1) : vertices;

  const ticksEvery = (step: number) => {
    const ticks: ChartGeometry['yTicks'] = [];
    for (let value = Math.ceil(low / step) * step; value <= high; value += step) {
      const tick = Number(value.toPrecision(12));
      ticks.push({ y: y(tick), label: unit.tick(tick) });
    }
    return ticks;
  };
  // Rounding the step up can leave a single gridline, which gives no scale; halve it once if so.
  const step = niceStep((high - low) / Y_TICK_TARGET);
  const coarse = ticksEvery(step);
  const yTicks = coarse.length >= 2 ? coarse : ticksEvery(niceStep(step / 2));

  const xTicks =
    span > 0
      ? Array.from({ length: X_TICK_COUNT }, (_, index) => {
          const t = start + ((index + 0.5) / X_TICK_COUNT) * span;
          return { x: x(t), label: timeLabel(t, span) };
        })
      : [];

  return { height: HEIGHT, plot: PLOT, line, live, marks, yTicks, xTicks };
}

/**
 * The market card's chart from the chart query's latest answer and error, in dollars at the Dollar
 * rate or else in the Paired asset, drawn up to `nowMs`. A failed refresh keeps the last good chart; a 404 is a token with no trades yet,
 * not an error.
 */
export function marketChart(query: { data: ChartResponse | undefined; error: unknown }, nowMs: number): MarketChart {
  const { data, error } = query;
  if (!data) return pendingMarketQuery(error);
  const latest = data.points.at(-1);
  // With no trade in the range the route sends no price to draw or to head the chart with.
  if (!latest) return { status: 'empty' };

  const supply = fromRawAmount(data.supply, data.tokenDecimals);
  const unit = denomination(data.quoteUsd, data.quoteSymbol);
  const capOf = (price: number) => price * supply * unit.rate;
  // The route measures the change from the price when the range began, so that price is the
  // latest over one plus the change; a change of -100% or below leaves no such price. The opening
  // sits no later than the first bucket, whose start the route may round down past the range's.
  const rangeSeconds = RANGE_SECONDS[data.range];
  const opening =
    rangeSeconds !== null && data.change !== null && data.change > -100
      ? {
          t: Math.min(nowMs / 1000 - rangeSeconds, data.points[0]!.t),
          price: latest.price / (1 + data.change / 100),
        }
      : null;
  return {
    status: 'ready',
    marketCap: unit.headline(capOf(latest.price)),
    change: data.change === null ? null : formatChange(data.change),
    chart: drawChart(data.points, opening, capOf, unit, data.range === '5m' ? markTimeSeconds : markTime, nowMs / 1000),
  };
}

/** The index of the mark nearest `x`, in SVG user units. */
export function nearestMark(marks: ChartMark[], x: number): number {
  return nearestIndex(
    marks.map((mark) => mark.x),
    x,
  );
}

/** The index of the value nearest `target`, the first on a tie. */
function nearestIndex(values: number[], target: number): number {
  let nearest = 0;
  for (let index = 1; index < values.length; index++) {
    if (Math.abs(values[index]! - target) < Math.abs(values[nearest]! - target)) nearest = index;
  }
  return nearest;
}

/**
 * The index of the mark at moment `t`, so the cursor stays put as the chart refreshes. A moment the
 * range has since dropped moves to the nearest one still in it.
 */
export function markAt(marks: ChartMark[], t: ChartMark['t']): number {
  if (t === 'now') return marks.length - 1;
  return nearestIndex(
    // Now is never the nearest past moment.
    marks.map((mark) => (mark.t === 'now' ? Infinity : mark.t)),
    t,
  );
}

/** How far each arrow key moves the cursor, as on a slider: right and up later, left and down earlier. */
const ARROW_STEPS: Partial<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

/**
 * The mark a key moves the cursor to among `count` marks, from `index`, or from nowhere yet, which
 * lands on now. `null` for a key that does not move it.
 */
export function stepMark(count: number, index: number | null, key: string): number | null {
  const now = count - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return now;
  const step = ARROW_STEPS[key];
  if (step === undefined) return null;
  if (index === null) return now;
  return Math.min(now, Math.max(0, index + step));
}

/** A token's market cap chart for one range, its right edge kept at now between reads. */
export function useMarketChart(token: Address, range: ChartRange): MarketChart {
  const { data, error } = useQuery(marketChartQuery(token, range));
  const nowMs = useNow(MARKET_REFRESH_MS);
  return useMemo(() => marketChart({ data, error }, nowMs), [data, error, nowMs]);
}
