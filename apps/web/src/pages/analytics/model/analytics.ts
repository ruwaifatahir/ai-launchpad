import { useQuery } from '@tanstack/react-query';
import { formatCompactAmount, formatCompactDollars } from '@/shared/lib';
import { analyticsQuery, type ApiAnalytics, type ApiDayFigures } from '../api/analytics';

/** "24h" is the last full UTC day, not the last 24 hours. */
export type Range = '24h' | 'all';

/** A headline metric. `value` is pre-formatted, e.g. `$208.75M`. */
export type MetricStat = {
  label: string;
  value: string;
  note: string;
};

/** One bar of a daily chart. `null` is a day with no figure yet, not a zero. */
export type DailyPoint = {
  /** Start of the UTC day, unix seconds: unique, where `date` repeats a year apart. */
  day: number;
  date: string;
  value: number | null;
};

export type AnalyticsView = {
  /** e.g. `Latest complete day Sep 26 UTC`. `null` for an empty launchpad. */
  dateLabel: string | null;
  stats: MetricStat[];
  volume: DailyPoint[];
  launches: DailyPoint[];
  /** Symbols of quote assets whose trading is in no dollar figure. */
  unpricedSymbols: string[];
};

/** The 24h view's charts show this many of the latest days. */
const RECENT_DAYS = 14;

/** Written in place of a figure that cannot be given. */
export const NO_FIGURE = '—';

/** Each range's cards, in order: the range's own two, then the two both ranges share. */
const STAT_LABELS: Record<Range, readonly [string, string, string, string]> = {
  '24h': ['24h volume', '24h launches', 'Creators', 'Average daily volume'],
  all: ['All-time volume', 'All-time launches', 'Creators', 'Average daily volume'],
};

/** The range's cards before the figures arrive: every label, no figure yet. */
export function pendingStats(range: Range): MetricStat[] {
  return STAT_LABELS[range].map((label) => ({ label, value: NO_FIGURE, note: '' }));
}

const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** A UTC day's start in unix seconds → `Sep 26`. */
export function formatDay(day: number): string {
  return dayFormat.format(day * 1000);
}

function dollars(value: number | null): string {
  return value === null ? NO_FIGURE : formatCompactDollars(value);
}

/** The last day against the one before it, e.g. `-15.8% from prior day`; `null` with nothing to compare. */
export function changeNote(last: number | null | undefined, prior: number | null | undefined): string | null {
  if (last == null || prior == null || prior === 0) return null;
  const change = ((last - prior) / prior) * 100;
  const sign = change > 0 ? '+' : change < 0 ? '-' : '';
  return `${sign}${Math.abs(change).toFixed(1)}% from prior day`;
}

function dayNote(last: number | null | undefined, prior: number | null | undefined): string {
  return changeNote(last, prior) ?? 'Latest complete day';
}

function points(days: ApiDayFigures[], value: (day: ApiDayFigures) => number | null): DailyPoint[] {
  return days.map((day) => ({ day: day.day, date: formatDay(day.day), value: value(day) }));
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Every figure the Analytics page shows for one range, from the analytics route's answer. */
export function analyticsView(data: ApiAnalytics, range: Range): AnalyticsView {
  const { totals, lastDay, priorDay, series } = data;
  const partial = totals.unpricedDays > 0 ? `Leaves out ${plural(totals.unpricedDays, 'unpriced day')}` : null;
  const noDollars = totals.volumeUsd === null ? 'No dollar figures yet' : null;

  const [volumeLabel, launchesLabel, creatorsLabel, averageLabel] = STAT_LABELS[range];
  const rangeStats: MetricStat[] =
    range === '24h'
      ? [
          {
            label: volumeLabel,
            value: dollars(lastDay?.volumeUsd ?? null),
            note:
              noDollars ??
              (lastDay && lastDay.volumeUsd === null ? 'Waiting for the day’s rate' : null) ??
              dayNote(lastDay?.volumeUsd, priorDay?.volumeUsd),
          },
          {
            label: launchesLabel,
            value: formatCompactAmount(lastDay?.launches ?? 0),
            note: dayNote(lastDay?.launches, priorDay?.launches),
          },
        ]
      : [
          { label: volumeLabel, value: dollars(totals.volumeUsd), note: noDollars ?? partial ?? 'Lifetime total' },
          { label: launchesLabel, value: formatCompactAmount(totals.launches), note: 'Lifetime total' },
        ];

  const days = range === '24h' ? series.slice(-RECENT_DAYS) : series;

  return {
    dateLabel: data.lastFullDay === null ? null : `Latest complete day ${formatDay(data.lastFullDay)} UTC`,
    stats: [
      ...rangeStats,
      { label: creatorsLabel, value: formatCompactAmount(totals.creators), note: 'Lifetime total' },
      {
        label: averageLabel,
        value: dollars(totals.averageDailyVolumeUsd),
        note: noDollars ?? partial ?? `Across ${plural(series.length, 'completed day')}`,
      },
    ],
    volume: points(days, (day) => day.volumeUsd),
    launches: points(days, (day) => day.launches),
    unpricedSymbols: data.unpricedQuoteAssets.map((asset) => asset.symbol),
  };
}

export type Analytics =
  { status: 'loading' } | { status: 'error'; retry: () => void } | { status: 'ready'; view: AnalyticsView };

/** The page's figures for `range`. Both ranges read the same answer, so switching makes no request. */
export function useAnalytics(range: Range): Analytics {
  const { data, error, refetch } = useQuery(analyticsQuery());
  // A failed refetch keeps the last good figures on screen.
  if (data) return { status: 'ready', view: analyticsView(data, range) };
  if (error) return { status: 'error', retry: () => void refetch() };
  return { status: 'loading' };
}
