import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { launchToken, type ApiPairedAsset, type LaunchToken } from '@/entities/token';
import { shortenAddress, useNow } from '@/shared/lib';
import { pageCount } from '@/shared/ui/pagination';
import { pairedAssetsQuery, searchQuery, type SearchFilters, type SearchPage } from '../api/token-lists';
import { LIST_REFRESH_MS } from '../config/explore-filters';

/** One search result, ready to display. */
export type SearchResult = Pick<LaunchToken, 'address' | 'image' | 'name' | 'ticker' | 'graduated' | 'figure'> & {
  /** When the token launched. */
  time: { text: string; datetime: string };
};

/** The footer: which results are on screen, and whether there are more either side. */
export type SearchPaging = { range: string; hasPrevious: boolean; hasNext: boolean };

/** What the results list shows. `pageCount` is how many pages the results fill: at least one. */
export type SearchView =
  | { status: 'loading' }
  /** The backend or the indexer did not answer. */
  | { status: 'unavailable' }
  | { status: 'empty'; message: string; pageCount: number }
  | { status: 'ready'; results: SearchResult[]; paging: SearchPaging; pageCount: number };

const countFormat = new Intl.NumberFormat('en-US');

function emptyMessage(page: SearchPage): string {
  if (page.q) return `No token matches “${page.q}”.`;
  if (page.age !== 'all' || page.pair) return 'No token matches these filters.';
  return 'No token has launched yet.';
}

function searchResult(token: SearchPage['tokens'][number], sort: SearchPage['sort'], nowMs: number): SearchResult {
  // A card under no Explore sort shows the market cap and the launch time, as a result does;
  // under Volume it shows the volume instead.
  const { address, image, name, ticker, graduated, figure, time } = launchToken(token, {
    shows: { figure: sort === 'volume' ? 'volume' : 'market-cap', time: 'launch' },
    nowMs,
  });
  return { address, image, name, ticker, graduated, figure, time: { text: time.text, datetime: time.datetime } };
}

/**
 * The results from the search query's latest answer and error, as of `nowMs`. What an empty list
 * says follows the text and filters the answer was read for.
 */
export function searchView(
  { data, error }: { data: SearchPage | undefined; error: unknown },
  nowMs: number,
): SearchView {
  if (error) return { status: 'unavailable' };
  if (!data) return { status: 'loading' };
  const pages = pageCount(data);
  if (data.tokens.length === 0) return { status: 'empty', message: emptyMessage(data), pageCount: pages };

  const first = (data.page - 1) * data.pageSize + 1;
  const last = first + data.tokens.length - 1;
  return {
    status: 'ready',
    results: data.tokens.map((token) => searchResult(token, data.sort, nowMs)),
    paging: {
      range: `${countFormat.format(first)} to ${countFormat.format(last)} of ${countFormat.format(data.total)}`,
      hasPrevious: data.page > 1,
      hasNext: last < data.total,
    },
    pageCount: pages,
  };
}

/** One option of the Pair filter: a Paired asset's address, or `null` for every pair. */
export type PairOption = { value: string | null; label: string };

/**
 * The Pair filter's options: every pair, then each Paired asset some token uses, in the route's
 * order. Two sharing a symbol carry their short addresses, since only the address tells them apart.
 */
export function pairOptions(assets: ApiPairedAsset[] | undefined): PairOption[] {
  const list = assets ?? [];
  const symbolCount = new Map<string, number>();
  for (const asset of list) symbolCount.set(asset.symbol, (symbolCount.get(asset.symbol) ?? 0) + 1);
  return [
    { value: null, label: 'All' },
    ...list.map((asset) => ({
      value: asset.address,
      label: symbolCount.get(asset.symbol)! > 1 ? `${asset.symbol} ${shortenAddress(asset.address)}` : asset.symbol,
    })),
  ];
}

/**
 * The results for `filters`, and whether they are still the last search's, kept on screen while
 * this one loads. Stale results are not to be chosen by keyboard.
 */
export function useSearchView(filters: SearchFilters): { view: SearchView; stale: boolean } {
  const { data, error, isPlaceholderData } = useQuery(searchQuery(filters));
  const nowMs = useNow(LIST_REFRESH_MS);
  const view = useMemo(() => searchView({ data, error }, nowMs), [data, error, nowMs]);
  return { view, stale: isPlaceholderData };
}

/** The Pair filter's options. Until the list arrives, or if it cannot, only every pair. */
export function usePairOptions(): PairOption[] {
  const { data } = useQuery(pairedAssetsQuery());
  return useMemo(() => pairOptions(data), [data]);
}

/** `value` once it has held still for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
