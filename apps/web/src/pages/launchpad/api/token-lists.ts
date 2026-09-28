import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { ApiListedToken, ApiPairedAsset } from '@/entities/token';
import { apiRequest } from '@/shared/api';
import { LIST_REFRESH_MS, type ExploreSort, type ListAge } from '../config/explore-filters';
import { SEARCH_PAGE_SIZE, type SearchSort } from '../config/search-filters';

/** One page of `GET /api/v1/market/tokens/graduated`, largest market cap first. */
export type GraduatedPage = {
  page: number;
  pageSize: number;
  /** Every graduated token. */
  total: number;
  tokens: ApiListedToken[];
};

/** One page of `GET /api/v1/market/tokens/explore`: tokens still on their bonding curve. */
export type ExplorePage = {
  sort: ExploreSort;
  age: ListAge;
  page: number;
  pageSize: number;
  /** The tokens the sort and age keep. */
  total: number;
  /** Every token ever launched, graduated or not. */
  launched: number;
  tokens: ApiListedToken[];
};

/** What the search dialog asks for. */
export type SearchFilters = {
  /** Trimmed. Empty browses every token. */
  q: string;
  sort: SearchSort;
  age: ListAge;
  /** A Paired asset's address, or `null` for every pair. */
  pair: string | null;
  page: number;
};

/**
 * One page of `GET /api/v1/market/tokens/search`, with the text and pair it was read for, so what
 * it says when empty follows the answer and not text typed since.
 */
export type SearchPage = {
  sort: SearchSort;
  age: ListAge;
  page: number;
  pageSize: number;
  /** The tokens matching. */
  total: number;
  tokens: ApiListedToken[];
  q: string;
  pair: string | null;
};

export type ExploreFilters = { sort: ExploreSort; age: ListAge; page: number; pageSize: number };

export const tokenListKeys = {
  all: ['token-lists'] as const,
  graduated: (page: number, pageSize: number) => [...tokenListKeys.all, 'graduated', page, pageSize] as const,
  explore: (filters: ExploreFilters) =>
    [...tokenListKeys.all, 'explore', filters.sort, filters.age, filters.page, filters.pageSize] as const,
  /** Text is matched ignoring case, so its case does not split the cache. */
  search: (filters: SearchFilters) =>
    [
      ...tokenListKeys.all,
      'search',
      filters.q.toLowerCase(),
      filters.sort,
      filters.age,
      filters.pair ?? '',
      filters.page,
    ] as const,
  pairedAssets: () => [...tokenListKeys.all, 'paired-assets'] as const,
};

/*
 * Every list is public, so none sends a Credential. They are polled rather than retried, as the
 * Token page's market reads are, and the poll pauses while the tab is hidden (react-query's
 * default). Paging, sorting and resizing keep the last page on screen until the next one lands.
 */

export function graduatedQuery(page: number, pageSize: number) {
  return queryOptions({
    queryKey: tokenListKeys.graduated(page, pageSize),
    queryFn: () =>
      apiRequest<GraduatedPage>(`/api/v1/market/tokens/graduated?page=${page}&pageSize=${pageSize}`, {
        credential: null,
      }),
    refetchInterval: LIST_REFRESH_MS,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function exploreQuery(filters: ExploreFilters) {
  const params = new URLSearchParams({
    sort: filters.sort,
    age: filters.age,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  return queryOptions({
    queryKey: tokenListKeys.explore(filters),
    queryFn: () => apiRequest<ExplorePage>(`/api/v1/market/tokens/explore?${params}`, { credential: null }),
    refetchInterval: LIST_REFRESH_MS,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/** The query string for a search, sending only the filters that narrow it. */
export function searchParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams({
    sort: filters.sort,
    age: filters.age,
    page: String(filters.page),
    pageSize: String(SEARCH_PAGE_SIZE),
  });
  if (filters.q) params.set('q', filters.q);
  if (filters.pair) params.set('quote', filters.pair);
  return params;
}

/** Polled like the grids while the dialog is open. Typing and paging keep the last results on screen. */
export function searchQuery(filters: SearchFilters) {
  return queryOptions({
    queryKey: tokenListKeys.search(filters),
    queryFn: async (): Promise<SearchPage> => {
      const page = await apiRequest<Omit<SearchPage, 'q' | 'pair'>>(
        `/api/v1/market/tokens/search?${searchParams(filters)}`,
        { credential: null },
      );
      return { ...page, q: filters.q, pair: filters.pair };
    },
    refetchInterval: LIST_REFRESH_MS,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/** A new Paired asset is rare, so the Pair filter reads the list once a minute at most. */
export function pairedAssetsQuery() {
  return queryOptions({
    queryKey: tokenListKeys.pairedAssets(),
    queryFn: () =>
      apiRequest<{ quoteAssets: ApiPairedAsset[] }>('/api/v1/market/quote-assets', { credential: null }).then(
        (data) => data.quoteAssets,
      ),
    staleTime: 60_000,
    retry: false,
  });
}
