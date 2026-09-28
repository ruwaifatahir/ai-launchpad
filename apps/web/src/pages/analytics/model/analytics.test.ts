import { describe, expect, it } from 'vitest';
import type { ApiAnalytics, ApiDayFigures } from '../api/analytics';
import { analyticsView, changeNote, pendingStats } from './analytics';

const SEP_25 = 1_790_294_400;
const SEP_26 = 1_790_380_800;
const DAY = 86_400;

const day = (start: number, launches: number, volumeUsd: number | null): ApiDayFigures => ({
  day: start,
  launches,
  volumeUsd,
});

const answer = (overrides: Partial<ApiAnalytics> = {}): ApiAnalytics => ({
  lastFullDay: SEP_26,
  totals: {
    launches: 9,
    creators: 2,
    volumeUsd: 146_562.57,
    averageDailyVolumeUsd: 73_281.28,
    unpricedDays: 0,
  },
  lastDay: day(SEP_26, 5, 119_825.2),
  priorDay: day(SEP_25, 4, 26_737.36),
  series: [day(SEP_25, 4, 26_737.36), day(SEP_26, 5, 119_825.2)],
  unpricedQuoteAssets: [],
  ...overrides,
});

const values = (view: ReturnType<typeof analyticsView>) =>
  view.stats.map((stat) => [stat.label, stat.value, stat.note]);

describe('analyticsView', () => {
  it('shows the last full day, against the day before, in the 24h view', () => {
    const view = analyticsView(answer(), '24h');
    expect(view.dateLabel).toBe('Latest complete day Sep 26 UTC');
    expect(values(view)).toEqual([
      ['24h volume', '$119.83K', '+348.2% from prior day'],
      ['24h launches', '5', '+25.0% from prior day'],
      ['Creators', '2', 'Lifetime total'],
      ['Average daily volume', '$73.28K', 'Across 2 completed days'],
    ]);
  });

  it('shows the totals in the all time view', () => {
    expect(values(analyticsView(answer(), 'all')).slice(0, 2)).toEqual([
      ['All-time volume', '$146.56K', 'Lifetime total'],
      ['All-time launches', '9', 'Lifetime total'],
    ]);
  });

  it('charts the last 14 days in the 24h view and every day in the all time view', () => {
    const series = Array.from({ length: 20 }, (_, index) => day(SEP_26 - (19 - index) * DAY, index, index));
    const data = answer({ series });
    expect(analyticsView(data, '24h').launches).toHaveLength(14);
    expect(analyticsView(data, '24h').launches.at(-1)).toEqual({ day: SEP_26, date: 'Sep 26', value: 19 });
    expect(analyticsView(data, 'all').volume).toHaveLength(20);
  });

  it('shows no change with no prior day', () => {
    const view = analyticsView(answer({ priorDay: null, series: [day(SEP_26, 5, 119_825.2)] }), '24h');
    expect(view.stats[0]!.note).toBe('Latest complete day');
    expect(view.stats[1]!.note).toBe('Latest complete day');
  });

  it('dashes every dollar figure while dollar rates are off, and keeps launches and creators', () => {
    const data = answer({
      totals: { launches: 9, creators: 2, volumeUsd: null, averageDailyVolumeUsd: null, unpricedDays: 0 },
      lastDay: day(SEP_26, 5, null),
      priorDay: day(SEP_25, 4, null),
      series: [day(SEP_25, 4, null), day(SEP_26, 5, null)],
    });
    expect(values(analyticsView(data, 'all'))).toEqual([
      ['All-time volume', '—', 'No dollar figures yet'],
      ['All-time launches', '9', 'Lifetime total'],
      ['Creators', '2', 'Lifetime total'],
      ['Average daily volume', '—', 'No dollar figures yet'],
    ]);
    expect(analyticsView(data, '24h').volume.map((point) => point.value)).toEqual([null, null]);
  });

  it('keeps an unpriced day out of the chart and says the total is partial', () => {
    const data = answer({
      totals: { launches: 9, creators: 2, volumeUsd: 26_737.36, averageDailyVolumeUsd: 13_368.68, unpricedDays: 1 },
      lastDay: day(SEP_26, 5, null),
      series: [day(SEP_25, 4, 26_737.36), day(SEP_26, 5, null)],
    });
    const view = analyticsView(data, 'all');
    expect(view.volume.at(-1)!.value).toBeNull();
    expect(view.stats[0]!.note).toBe('Leaves out 1 unpriced day');
    expect(analyticsView(data, '24h').stats[0]).toEqual({
      label: '24h volume',
      value: '—',
      note: 'Waiting for the day’s rate',
    });
  });

  it('names the quote assets whose trading is in no dollar figure', () => {
    const view = analyticsView(answer({ unpricedQuoteAssets: [{ address: '0x01', symbol: 'NVDA' }] }), '24h');
    expect(view.unpricedSymbols).toEqual(['NVDA']);
  });

  it('shows an empty launchpad as zeros, empty charts and no date', () => {
    const view = analyticsView(
      {
        lastFullDay: null,
        totals: { launches: 0, creators: 0, volumeUsd: 0, averageDailyVolumeUsd: 0, unpricedDays: 0 },
        lastDay: null,
        priorDay: null,
        series: [],
        unpricedQuoteAssets: [],
      },
      '24h',
    );
    expect(view.dateLabel).toBeNull();
    expect(view.volume).toEqual([]);
    expect(view.stats.map((stat) => stat.value)).toEqual(['—', '0', '0', '$0']);
  });
});

describe('changeNote', () => {
  it('shows no change against a zero or missing figure', () => {
    expect(changeNote(5, 0)).toBeNull();
    expect(changeNote(5, null)).toBeNull();
    expect(changeNote(null, 5)).toBeNull();
    expect(changeNote(4, 5)).toBe('-20.0% from prior day');
  });
});

describe('pendingStats', () => {
  it('lists the range’s cards with no figures', () => {
    expect(pendingStats('all').map((stat) => stat.label)).toEqual([
      'All-time volume',
      'All-time launches',
      'Creators',
      'Average daily volume',
    ]);
  });
});
