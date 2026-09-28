import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Address } from 'viem';
import { formatCompactAmount, formatTradeAmount, fromRawAmount, useNow } from '@/shared/lib';
import { recentTradesQuery, type ApiTrade, type TradePage } from '../api/recent-trades';
import { MARKET_REFRESH_MS } from '../config/refresh';
import { pageCount, pendingMarketQuery, type MarketQueryPending } from './market-query';

/** A trade ready to display. */
export type TradeRowView = {
  id: string;
  side: ApiTrade['side'];
  /** `null` for a user's trade; names the protocol's own trades so they don't read as a user's. */
  label: string | null;
  /** Token amount, e.g. `1.89K`. */
  amount: string;
  /** Amount of the Paired asset, e.g. `0.581307`. */
  pairAmount: string;
  venue: string;
  wallet: string;
  txHash: string;
  /** ISO 8601, for the `<time>` element. */
  datetime: string;
  /** Full date and time behind the relative age, e.g. `Sep 21, 2026, 3:04:05 PM`. */
  fullTime: string;
  /** Relative age, e.g. `now` or `5m`. */
  age: string;
};

export type RecentTrades =
  MarketQueryPending | { status: 'ready'; total: number; pageCount: number; trades: TradeRowView[] };

const LABEL: Record<ApiTrade['kind'], string | null> = {
  user: null,
  buyback: 'Buyback',
  fee_conversion: 'Fee conversion',
};

const VENUE: Record<ApiTrade['venue'], string> = { curve: 'Bonding curve', pool: 'Uniswap v4' };

const FULL_TIME = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium' });

function formatAge(seconds: number): string {
  if (seconds < 60) return 'now';
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/**
 * The Recent trades tab from the trades query's latest answer and error, as of `nowMs`. A failed
 * refresh keeps showing the last good page; a 404 is a token with no trades yet, not an error.
 */
export function recentTrades(query: { data: TradePage | undefined; error: unknown }, nowMs: number): RecentTrades {
  const { data, error } = query;
  if (!data) return pendingMarketQuery(error);
  if (data.total === 0) return { status: 'empty' };

  return {
    status: 'ready',
    total: data.total,
    pageCount: pageCount(data.total, data.pageSize),
    trades: data.trades.map((trade) => {
      const date = new Date(trade.timestamp * 1000);
      return {
        id: trade.id,
        side: trade.side,
        label: LABEL[trade.kind],
        amount: formatCompactAmount(fromRawAmount(trade.tokenAmount, data.tokenDecimals)),
        pairAmount: formatTradeAmount(fromRawAmount(trade.quoteAmount, data.quoteDecimals)),
        venue: VENUE[trade.venue],
        wallet: trade.trader,
        txHash: trade.transactionHash,
        datetime: date.toISOString(),
        fullTime: FULL_TIME.format(date),
        age: formatAge(nowMs / 1000 - trade.timestamp),
      };
    }),
  };
}

/** One page of a token's trades, with each age kept current between reads. */
export function useRecentTrades(token: Address, page: number): RecentTrades {
  const { data, error } = useQuery(recentTradesQuery(token, page));
  const nowMs = useNow(MARKET_REFRESH_MS);
  return useMemo(() => recentTrades({ data, error }, nowMs), [data, error, nowMs]);
}
