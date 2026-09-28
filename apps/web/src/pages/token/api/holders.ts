import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { Address } from 'viem';
import { apiRequest } from '@/shared/api';
import { MARKET_REFRESH_MS } from '../config/refresh';
import { marketKeys } from './market-keys';

/** Which of the launchpad's own contracts, or the token's creator, a holder is. */
export type HolderLabel =
  'bonding_curve' | 'uniswap_pool' | 'locker' | 'buyback_vault' | 'hook' | 'burn_address' | 'creator';

/** One holder as the backend's holders route sends it. */
export type ApiHolder = {
  wallet: string;
  /** A raw integer, in the page's `tokenDecimals`. */
  balance: string;
  /** A percent of the current supply: 12.5 is 12.5%. `null` only for a supply of zero. */
  share: number | null;
  label: HolderLabel | null;
};

/** One page of `GET /api/v1/market/tokens/:address/holders`, largest balance first. */
export type HolderPage = {
  tokenDecimals: number;
  supply: string;
  page: number;
  pageSize: number;
  /** Every listed holder, the labelled contracts included, for paging. */
  total: number;
  /** Real holders: the labelled contracts left out, the creator counted. */
  holderCount: number;
  holders: ApiHolder[];
};

/**
 * One page of a token's holders from the backend, which reads them from the indexer. Public, so it
 * sends no Credential. Polled rather than retried, as the trades are. Read once up front so the tab
 * can show its count, then only polled while `polling`, so a tab nobody is looking at stays quiet.
 */
export function holdersQuery(token: Address, page: number, polling: boolean) {
  return queryOptions({
    queryKey: marketKeys.holders(token, page),
    queryFn: () => apiRequest<HolderPage>(`/api/v1/market/tokens/${token}/holders?page=${page}`, { credential: null }),
    refetchInterval: polling ? MARKET_REFRESH_MS : false,
    retry: false,
    // Paging keeps the last page on screen until the next one lands.
    placeholderData: keepPreviousData,
  });
}
