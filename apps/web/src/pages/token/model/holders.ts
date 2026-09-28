import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Address } from 'viem';
import { formatCompactAmount, fromRawAmount } from '@/shared/lib';
import { holdersQuery, type HolderLabel, type HolderPage } from '../api/holders';
import { pageCount, pendingMarketQuery, type MarketQueryPending } from './market-query';

/** A holder ready to display. */
export type HolderRowView = {
  /** Position by balance across every page, from 1. */
  rank: number;
  wallet: string;
  /** `null` for anyone but the launchpad's contracts and the creator. */
  label: string | null;
  /** Share of the current supply, e.g. `1.25%`. */
  share: string;
  /** The same share from 0 to 100, for the bar drawn behind it. */
  sharePercent: number;
  /** Token balance, e.g. `12.5M`. */
  balance: string;
};

export type Holders =
  MarketQueryPending | { status: 'ready'; holderCount: number; pageCount: number; holders: HolderRowView[] };

const LABEL: Record<HolderLabel, string> = {
  bonding_curve: 'Bonding curve',
  uniswap_pool: 'Uniswap v4 pool',
  locker: 'Locker',
  buyback_vault: 'Buyback vault',
  hook: 'Hook',
  burn_address: 'Burn address',
  creator: 'Creator',
};

/** Shares are written to this many decimals; a share above zero too small to show reads as under the smallest step. */
const SHARE_DECIMALS = 2;
const SMALLEST_SHARE = 10 ** -SHARE_DECIMALS;

function formatShare(share: number | null): string {
  if (share === null) return '–';
  if (share > 0 && share < SMALLEST_SHARE) return `<${SMALLEST_SHARE.toFixed(SHARE_DECIMALS)}%`;
  return `${share.toFixed(SHARE_DECIMALS)}%`;
}

/**
 * The Holders tab from the holders query's latest answer and error. A failed refresh keeps
 * showing the last good page; a 404 is a token with no holders yet, not an error.
 */
export function holders(query: { data: HolderPage | undefined; error: unknown }): Holders {
  const { data, error } = query;
  if (!data) return pendingMarketQuery(error);
  if (data.total === 0) return { status: 'empty' };

  return {
    status: 'ready',
    holderCount: data.holderCount,
    pageCount: pageCount(data.total, data.pageSize),
    holders: data.holders.map((holder, index) => ({
      rank: (data.page - 1) * data.pageSize + index + 1,
      wallet: holder.wallet,
      label: holder.label === null ? null : LABEL[holder.label],
      share: formatShare(holder.share),
      sharePercent: Math.min(100, Math.max(0, holder.share ?? 0)),
      balance: formatCompactAmount(fromRawAmount(holder.balance, data.tokenDecimals)),
    })),
  };
}

/** One page of a token's holders; see {@link holdersQuery} for when it is polled. */
export function useHolders(token: Address, page: number, polling: boolean): Holders {
  const { data, error } = useQuery(holdersQuery(token, page, polling));
  return useMemo(() => holders({ data, error }), [data, error]);
}
