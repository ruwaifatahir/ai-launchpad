import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/shared/api';

/** One UTC day of launchpad activity. */
export type ApiDayFigures = {
  /** Start of the UTC day, unix seconds. */
  day: number;
  launches: number;
  /** US dollars. `null` while dollar rates are off, or while the day waits for its rate. */
  volumeUsd: number | null;
};

/** `GET /api/v1/market/analytics`: every figure stops at the end of the last full UTC day. */
export type ApiAnalytics = {
  /** Start of the last full UTC day, unix seconds. `null` while the series is empty. */
  lastFullDay: number | null;
  totals: {
    launches: number;
    creators: number;
    /** US dollars. `null` while dollar rates are off. */
    volumeUsd: number | null;
    /** `volumeUsd` over the days in the series. `null` when `volumeUsd` is. */
    averageDailyVolumeUsd: number | null;
    /** Days left out of `volumeUsd` for want of a stored rate. */
    unpricedDays: number;
  };
  lastDay: ApiDayFigures | null;
  priorDay: ApiDayFigures | null;
  /** One entry per UTC day, oldest first, from the first launch's day to `lastFullDay`. */
  series: ApiDayFigures[];
  /** Quote assets that traded but have no rate source: their volume is in no dollar figure. */
  unpricedQuoteAssets: { address: string; symbol: string }[];
};

/**
 * The Analytics page's figures. Public, so it sends no Credential. The answer changes once a day,
 * so it is fetched when the page opens and again on focus, never polled. Not retried: a 429 or an
 * indexer 503 shows the page's retry state instead.
 */
export function analyticsQuery() {
  return queryOptions({
    queryKey: ['market', 'analytics'],
    queryFn: () => apiRequest<ApiAnalytics>('/api/v1/market/analytics', { credential: null }),
    staleTime: 60_000,
    retry: false,
  });
}
