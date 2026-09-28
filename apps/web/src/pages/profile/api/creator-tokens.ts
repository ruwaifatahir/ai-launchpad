import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { ApiListedToken } from '@/entities/token';
import { apiRequest } from '@/shared/api';
import { PROFILE_PAGE_SIZE, PROFILE_REFRESH_MS } from '../config/profile-list';

/** One page of `GET /api/v1/market/creators/{creator}/tokens`: the tokens a wallet launched, newest first. */
export type CreatorTokensPage = {
  page: number;
  pageSize: number;
  /** Every token the wallet launched. */
  total: number;
  tokens: ApiListedToken[];
};

/** The route matches any letter case, so the key is lowercase and each spelling shares one cache entry. */
export const creatorTokensKeys = {
  all: ['creator-tokens'] as const,
  page: (creator: string, page: number) => [...creatorTokensKeys.all, creator.toLowerCase(), page] as const,
};

/**
 * Public, so no Credential. Polled like the launchpad's lists rather than retried, and paging keeps
 * the last page on screen until the next one lands.
 */
export function creatorTokensQuery(creator: string, page: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PROFILE_PAGE_SIZE) });
  return queryOptions({
    queryKey: creatorTokensKeys.page(creator, page),
    queryFn: () =>
      apiRequest<CreatorTokensPage>(`/api/v1/market/creators/${creator.toLowerCase()}/tokens?${params}`, {
        credential: null,
      }),
    refetchInterval: PROFILE_REFRESH_MS,
    retry: false,
    placeholderData: keepPreviousData,
  });
}
