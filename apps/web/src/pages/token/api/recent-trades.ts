import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { Address } from 'viem';
import { apiRequest } from '@/shared/api';
import { MARKET_REFRESH_MS } from '../config/refresh';
import { marketKeys } from './market-keys';

export type TradeSide = 'buy' | 'sell';

/** One trade as the backend's trades route sends it. Amounts are raw integers, in the page's decimals. */
export type ApiTrade = {
  id: string;
  side: TradeSide;
  /** `buyback` and `fee_conversion` are the protocol's own trades, signed by whoever swept the fees. */
  kind: 'user' | 'buyback' | 'fee_conversion';
  venue: 'curve' | 'pool';
  trader: string;
  tokenAmount: string;
  quoteAmount: string;
  price: number;
  /** Unix seconds. */
  timestamp: number;
  transactionHash: string;
};

/** One page of `GET /api/v1/market/tokens/:address/trades`, newest first. */
export type TradePage = {
  tokenDecimals: number;
  quoteDecimals: number;
  quoteSymbol: string;
  page: number;
  pageSize: number;
  total: number;
  trades: ApiTrade[];
};

/**
 * One page of a token's trades from the backend, which reads them from the indexer. Public, so it
 * sends no Credential. Polled rather than retried: a token the indexer has not reached yet answers
 * 404 until it does, and the next poll asks again.
 */
export function recentTradesQuery(token: Address, page: number) {
  return queryOptions({
    queryKey: marketKeys.trades(token, page),
    queryFn: () => apiRequest<TradePage>(`/api/v1/market/tokens/${token}/trades?page=${page}`, { credential: null }),
    refetchInterval: MARKET_REFRESH_MS,
    retry: false,
    // Paging keeps the last page on screen until the next one lands.
    placeholderData: keepPreviousData,
  });
}
