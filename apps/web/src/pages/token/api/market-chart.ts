import { queryOptions } from '@tanstack/react-query';
import type { Address } from 'viem';
import { apiRequest } from '@/shared/api';
import type { ChartRange } from '../config/chart-ranges';
import { MARKET_REFRESH_MS } from '../config/refresh';
import { marketKeys } from './market-keys';

/** One bucket that held a trade. Buybacks and fee conversions count. */
export type ChartPoint = {
  /** The bucket's start, in unix seconds. */
  t: number;
  /** The last trade's price in the bucket, in the Paired asset per token. */
  price: number;
  /** Paired asset traded in the bucket, in whole units. */
  volume: number;
  tradeCount: number;
};

/** `GET /api/v1/market/tokens/:address/chart?range=…`. */
export type ChartResponse = {
  range: ChartRange;
  bucketSeconds: number;
  tokenDecimals: number;
  /** The token's current supply, a raw integer in `tokenDecimals`. */
  supply: string;
  quoteDecimals: number;
  quoteSymbol: string;
  /** The Paired asset's Dollar rate: dollars per whole unit, or `null` when the API has none. */
  quoteUsd: number | null;
  /** The range's % change from the price when it began, or `null` when the token has no trade to measure it from. */
  change: number | null;
  /** Oldest first. */
  points: ChartPoint[];
};

/**
 * A token's market cap chart for one range, from the backend, which reads it from the indexer.
 * Public, so it sends no Credential. Polled rather than retried, as the trades are. Switching range
 * asks for that range; the old range's chart is not kept on screen, since its % change would read
 * as the new range's.
 */
export function marketChartQuery(token: Address, range: ChartRange) {
  return queryOptions({
    queryKey: marketKeys.chart(token, range),
    queryFn: () =>
      apiRequest<ChartResponse>(`/api/v1/market/tokens/${token}/chart?range=${range}`, { credential: null }),
    refetchInterval: MARKET_REFRESH_MS,
    retry: false,
  });
}
