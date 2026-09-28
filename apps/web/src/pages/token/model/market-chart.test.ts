import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import type { ChartPoint, ChartResponse } from '../api/market-chart';
import { marketChart, markAt, nearestMark, stepMark, type ChartMark } from './market-chart';

const NOW_S = 1_790_000_000;
const NOW = NOW_S * 1000;

const point = (overrides: Partial<ChartPoint> = {}): ChartPoint => ({
  t: NOW_S - 60,
  price: 0.000003,
  volume: 0.5,
  tradeCount: 1,
  ...overrides,
});

const response = (overrides: Partial<ChartResponse> = {}): ChartResponse => ({
  range: '1h',
  bucketSeconds: 15,
  tokenDecimals: 18,
  // One billion tokens.
  supply: '1000000000000000000000000000',
  quoteDecimals: 18,
  quoteSymbol: 'ETH',
  quoteUsd: null,
  change: 2.784,
  points: [point({ t: NOW_S - 3_000, price: 0.000002 }), point({ t: NOW_S - 60, price: 0.000003 })],
  ...overrides,
});

const ready = (data: ChartResponse) => {
  const view = marketChart({ data, error: null }, NOW);
  if (view.status !== 'ready') throw new Error(`not ready: ${view.status}`);
  return view;
};

/** The y of every vertex on the line, in order. */
const lineYs = (line: string) => [...line.matchAll(/[ML] -?[\d.]+ (-?[\d.]+)/g)].map((match) => Number(match[1]));
const lineXs = (line: string) => [...line.matchAll(/[ML] (-?[\d.]+) -?[\d.]+/g)].map((match) => Number(match[1]));

describe('marketChart', () => {
  it('heads the chart with the latest price times the supply, in the Paired asset', () => {
    // 0.000003 ETH × 1,000,000,000 tokens.
    expect(ready(response()).marketCap).toBe('3,000 ETH');
  });

  it('heads the chart in dollars at the Dollar rate the route sends', () => {
    // 3,000 ETH at $2,691.30180413.
    expect(ready(response({ quoteUsd: 2691.30180413 })).marketCap).toBe('$8.07M');
    // 0.5 ETH, below the compact threshold, in full.
    const small = response({ quoteUsd: 2691.30180413, supply: '1000000000000000000', points: [point({ price: 0.5 })] });
    expect(ready(small).marketCap).toBe('$1,345.65');
  });

  it('reads the supply in the token decimals the route sends', () => {
    // 1,000,000 tokens of 6 decimals at 0.5 USDC.
    const view = ready(
      response({
        tokenDecimals: 6,
        supply: '1000000000000',
        quoteSymbol: 'USDC',
        quoteDecimals: 6,
        points: [point({ price: 0.5 })],
      }),
    );
    expect(view.marketCap).toBe('500K USDC');
  });

  it('writes a market cap under one of the quote asset to four significant digits', () => {
    const view = ready(response({ supply: '1000000000000000000', points: [point({ price: 0.0123456 })] }));
    expect(view.marketCap).toBe('0.01235 ETH');
  });

  it('shows the change from the route, signed and to two decimals', () => {
    expect(ready(response({ change: 2.784 })).change).toEqual({ text: '+2.78%', direction: 'up' });
    expect(ready(response({ change: -12.5 })).change).toEqual({ text: '-12.50%', direction: 'down' });
    expect(ready(response({ change: 0 })).change).toEqual({ text: '0.00%', direction: 'flat' });
  });

  it('shows no change when the route sends none', () => {
    expect(ready(response({ change: null })).change).toBeNull();
  });

  it('draws higher market caps higher up, from the first trade to now on all', () => {
    const view = ready(
      response({
        range: 'all',
        points: [
          point({ t: NOW_S - 3_000, price: 0.000001 }),
          point({ t: NOW_S - 2_000, price: 0.000004 }),
          point({ t: NOW_S - 1_000, price: 0.000002 }),
        ],
      }),
    );
    const ys = lineYs(view.chart.line);
    const xs = lineXs(view.chart.line);
    // Each point, then the last price carried flat to now.
    expect(ys).toHaveLength(4);
    expect(ys[1]!).toBeLessThan(ys[2]!);
    expect(ys[2]!).toBeLessThan(ys[0]!);
    expect(ys[3]).toBe(ys[2]);
    expect(xs[0]).toBe(view.chart.plot.left);
    expect(xs[3]).toBe(view.chart.plot.right);
    expect(xs).toEqual(xs.toSorted((a, b) => a - b));
    expect(view.chart.live).toEqual({ x: xs[3], y: ys[3] });
  });

  it('starts a range at its opening price, so the line moves by the change shown', () => {
    // Up 50% over the hour to 0.000003: it opened at 0.000002, a 2,000 ETH market cap.
    const view = ready(response({ range: '1h', change: 50, points: [point({ t: NOW_S - 600, price: 0.000003 })] }));
    const xs = lineXs(view.chart.line);
    const ys = lineYs(view.chart.line);
    expect(xs[0]).toBe(view.chart.plot.left);
    // Ten minutes before now is five sixths of the way across the hour.
    const width = view.chart.plot.right - view.chart.plot.left;
    expect(xs[1]).toBeCloseTo(view.chart.plot.left + (width * 5) / 6, 1);
    expect(ys[0]!).toBeGreaterThan(ys[1]!);

    const opening = view.chart.yTicks.find((tick) => tick.label === '2K');
    expect(opening?.y).toBeCloseTo(ys[0]!, 1);
  });

  it('starts at the first trade in the range when there is no change to measure from', () => {
    const view = ready(response({ range: '1h', change: null, points: [point({ t: NOW_S - 600 })] }));
    expect(lineXs(view.chart.line)).toEqual([view.chart.plot.left, view.chart.plot.right]);
  });

  it('keeps a first bucket that starts before the range inside the plot, left to right', () => {
    // The route rounded the first bucket's start down, 30 seconds before the hour began.
    const view = ready(response({ range: '1h', change: 50, points: [point({ t: NOW_S - 3_630 })] }));
    const xs = lineXs(view.chart.line);
    expect(xs[0]).toBe(view.chart.plot.left);
    expect(xs).toEqual(xs.toSorted((a, b) => a - b));
  });

  it('starts at the first trade when the change leaves no opening price', () => {
    const view = ready(response({ range: '1h', change: -100, points: [point({ t: NOW_S - 600 })] }));
    expect(lineXs(view.chart.line)).toEqual([view.chart.plot.left, view.chart.plot.right]);
    expect(lineYs(view.chart.line).every(Number.isFinite)).toBe(true);
  });

  it('keeps every vertex inside the plot', () => {
    const view = ready(response());
    const { plot } = view.chart;
    for (const y of lineYs(view.chart.line)) {
      expect(y).toBeGreaterThanOrEqual(plot.top);
      expect(y).toBeLessThanOrEqual(plot.bottom);
    }
  });

  it('draws a single point, or a flat price, as a level line', () => {
    const single = ready(response({ range: 'all', points: [point({ t: NOW_S })] }));
    const ys = lineYs(single.chart.line);
    expect(new Set(ys).size).toBe(1);
    expect(lineXs(single.chart.line)).toEqual([single.chart.plot.left, single.chart.plot.right]);

    const flat = ready(response({ range: 'all', points: [point({ t: NOW_S - 600 }), point({ t: NOW_S - 300 })] }));
    expect(new Set(lineYs(flat.chart.line)).size).toBe(1);
  });

  it('labels the axis in market cap, largest at the top', () => {
    // Market caps from 2,000 to 3,000 ETH, not prices.
    const { yTicks } = ready(response()).chart;
    expect(yTicks.toSorted((a, b) => a.y - b.y).map((tick) => tick.label)).toEqual(['3K', '2.5K', '2K']);
  });

  it('labels the axis in dollars at the Dollar rate, and moves the line by the same scale', () => {
    // Market caps from 2,000 to 3,000 ETH at $2,000: $4M to $6M.
    const inPair = ready(response());
    const inDollars = ready(response({ quoteUsd: 2000 }));
    expect(inDollars.chart.yTicks.toSorted((a, b) => a.y - b.y).map((tick) => tick.label)).toEqual([
      '$6M',
      '$5M',
      '$4M',
    ]);
    expect(inDollars.chart.line).toBe(inPair.chart.line);
  });

  it('always draws at least two gridlines, so the axis gives a scale', () => {
    // Market caps of 177 and 49.79 ETH: a step of 100 would leave only the 100 line.
    const points = [point({ t: NOW_S - 3_000, price: 1.77e-7 }), point({ t: NOW_S - 60, price: 4.979e-8 })];
    const { yTicks } = ready(response({ points })).chart;
    expect(yTicks.map((tick) => tick.label)).toEqual(['50', '100', '150']);
  });

  it('gives each time label its hour when the range spans a few days', () => {
    const points = [point({ t: NOW_S - 2 * 86_400 }), point({ t: NOW_S - 60 })];
    const labels = ready(response({ range: 'all', points, change: null })).chart.xTicks.map((tick) => tick.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('labels the time axis inside the plot', () => {
    const view = ready(response());
    expect(view.chart.xTicks.length).toBeGreaterThanOrEqual(2);
    for (const tick of view.chart.xTicks) {
      expect(tick.x).toBeGreaterThanOrEqual(view.chart.plot.left);
      expect(tick.x).toBeLessThanOrEqual(view.chart.plot.right);
      expect(tick.label).not.toBe('');
    }
  });

  it("lists a hover mark for each trade bucket and for now, in the headline's market cap", () => {
    // Local times, so the labels read the same in any time zone.
    const first = new Date(2026, 8, 11, 22, 0).getTime() / 1000;
    const second = new Date(2026, 8, 12, 9, 30).getTime() / 1000;
    const now = new Date(2026, 8, 13, 12, 0).getTime();
    const data = response({
      range: 'all',
      change: null,
      quoteUsd: 2000,
      points: [point({ t: first, price: 0.000001 }), point({ t: second, price: 0.000003 })],
    });
    const view = marketChart({ data, error: null }, now);
    if (view.status !== 'ready') throw new Error(view.status);
    const { marks } = view.chart;
    // 1,000 and 3,000 ETH at $2,000.
    expect(marks.map(({ t, marketCap, time }) => ({ t, marketCap, time }))).toEqual([
      { t: first, marketCap: '$2M', time: 'Sep 11, 10:00 PM' },
      { t: second, marketCap: '$6M', time: 'Sep 12, 9:30 AM' },
      { t: 'now', marketCap: '$6M', time: 'Now' },
    ]);
    // From the first trade at the left edge to now at the right, the higher market cap higher up.
    expect(marks[0]!.x).toBe(view.chart.plot.left);
    expect(marks[2]!.x).toBe(view.chart.plot.right);
    expect(marks[1]!.y).toBeLessThan(marks[0]!.y);
  });

  it('starts the hover marks at the opening price, and gives times to the second on 5m', () => {
    const bucket = new Date(2026, 8, 27, 8, 25, 30).getTime() / 1000;
    const now = new Date(2026, 8, 27, 8, 27, 0).getTime();
    // Up 50% over five minutes: it opened at 2,000 ETH when the range began, at 8:22 AM.
    const data = response({ range: '5m', change: 50, points: [point({ t: bucket, price: 0.000003 })] });
    const view = marketChart({ data, error: null }, now);
    if (view.status !== 'ready') throw new Error(view.status);
    expect(view.chart.marks.map(({ marketCap, time }) => ({ marketCap, time }))).toEqual([
      { marketCap: '2,000 ETH', time: 'Sep 27, 8:22:00 AM' },
      { marketCap: '3,000 ETH', time: 'Sep 27, 8:25:30 AM' },
      { marketCap: '3,000 ETH', time: 'Now' },
    ]);
  });

  it('gives a first bucket that starts before the range one hover mark, not a second one for the opening', () => {
    const bucket = new Date(2026, 8, 27, 7, 59, 30).getTime() / 1000;
    const now = new Date(2026, 8, 27, 9, 0).getTime();
    // The route rounded the bucket's start down, 30 seconds before the hour began.
    const data = response({ range: '1h', change: 50, points: [point({ t: bucket, price: 0.000003 })] });
    const view = marketChart({ data, error: null }, now);
    if (view.status !== 'ready') throw new Error(view.status);
    expect(view.chart.marks.map(({ marketCap, time }) => ({ marketCap, time }))).toEqual([
      { marketCap: '3,000 ETH', time: 'Sep 27, 7:59 AM' },
      { marketCap: '3,000 ETH', time: 'Now' },
    ]);
  });

  it('reads a token with no trades in the range, or one the indexer does not know yet, as no trades yet', () => {
    expect(marketChart({ data: response({ points: [], change: null }), error: null }, NOW).status).toBe('empty');
    expect(marketChart({ data: undefined, error: new ApiError(404, 'unknown token') }, NOW).status).toBe('empty');
  });

  it('reads a 503, or any other failure, as unavailable', () => {
    expect(marketChart({ data: undefined, error: new ApiError(503, 'indexer down') }, NOW).status).toBe('unavailable');
    expect(marketChart({ data: undefined, error: new TypeError('Failed to fetch') }, NOW).status).toBe('unavailable');
  });

  it('keeps showing the last good chart when a refresh fails', () => {
    expect(marketChart({ data: response(), error: new ApiError(503, 'indexer down') }, NOW).status).toBe('ready');
  });

  it('is loading until the first answer', () => {
    expect(marketChart({ data: undefined, error: null }, NOW).status).toBe('loading');
  });
});

const mark = (t: ChartMark['t'], x: number): ChartMark => ({ t, x, y: 100, marketCap: '1', time: String(t) });

describe('nearestMark', () => {
  const marks = [mark(100, 4), mark(200, 50), mark(300, 60), mark('now', 568)];

  it('picks the mark closest to the pointer', () => {
    expect(nearestMark(marks, 0)).toBe(0);
    expect(nearestMark(marks, 26)).toBe(0);
    expect(nearestMark(marks, 28)).toBe(1);
    expect(nearestMark(marks, 56)).toBe(2);
    expect(nearestMark(marks, 400)).toBe(3);
    expect(nearestMark(marks, 900)).toBe(3);
  });
});

describe('markAt', () => {
  it('finds the same moment again after the chart refreshes', () => {
    // A new bucket arrived and everything shifted left.
    const refreshed = [mark(100, 4), mark(200, 40), mark(300, 52), mark(400, 60), mark('now', 568)];
    expect(markAt(refreshed, 200)).toBe(1);
  });

  it('stays on now', () => {
    expect(markAt([mark(100, 4), mark(200, 50), mark('now', 568)], 'now')).toBe(2);
  });

  it('moves to the nearest moment when the one it was on has left the range', () => {
    // The range rolled past 100; 260 is nearer to 300 than to 200.
    const refreshed = [mark(180, 4), mark(200, 30), mark(300, 60), mark('now', 568)];
    expect(markAt(refreshed, 100)).toBe(0);
    expect(markAt(refreshed, 260)).toBe(2);
  });
});

describe('stepMark', () => {
  it('starts from now, then steps one mark at a time without passing either end', () => {
    expect(stepMark(4, null, 'ArrowLeft')).toBe(3);
    expect(stepMark(4, null, 'ArrowRight')).toBe(3);
    expect(stepMark(4, 3, 'ArrowLeft')).toBe(2);
    expect(stepMark(4, 2, 'ArrowRight')).toBe(3);
    expect(stepMark(4, 0, 'ArrowLeft')).toBe(0);
    expect(stepMark(4, 3, 'ArrowRight')).toBe(3);
  });

  it('steps later on up and earlier on down, as a slider does', () => {
    expect(stepMark(4, 1, 'ArrowUp')).toBe(2);
    expect(stepMark(4, 1, 'ArrowDown')).toBe(0);
  });

  it('jumps to the first mark on Home and to now on End', () => {
    expect(stepMark(4, 2, 'Home')).toBe(0);
    expect(stepMark(4, 1, 'End')).toBe(3);
  });

  it('leaves any other key alone', () => {
    expect(stepMark(4, 2, 'Tab')).toBeNull();
  });
});
