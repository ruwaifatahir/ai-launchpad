import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { launchToken, type CardShows, type LaunchToken, type TokenGridView } from '@/entities/token';
import { useNow } from '@/shared/lib';
import { pageCount } from '@/shared/ui/pagination';
import {
  exploreQuery,
  graduatedQuery,
  type ExploreFilters,
  type ExplorePage,
  type GraduatedPage,
} from '../api/token-lists';
import { LIST_REFRESH_MS, type ExploreSort, type ListAge } from '../config/explore-filters';

/**
 * A grid, the count in its heading and how many pages it has: at least one. Count and pages are
 * `null` until the first answer.
 */
export type TokenList = { count: string | null; pageCount: number | null; grid: TokenGridView };

type ListQuery<T> = { data: T | undefined; error: unknown };

const countFormat = new Intl.NumberFormat('en-US');

const WINDOW: Record<Exclude<ListAge, 'all'>, string> = { '24h': 'the last 24 hours', '7d': 'the last 7 days' };

/** Why an Explore list is empty, in the terms of its sort and age. */
function emptyExploreMessage(sort: ExploreSort, age: ListAge): string {
  if (sort === 'recent-buys') {
    return age === 'all' ? 'No token has been bought yet.' : `No token was bought in ${WINDOW[age]}.`;
  }
  if (sort === 'volume') {
    return age === 'all' ? 'No token has traded yet.' : `No token traded in ${WINDOW[age]}.`;
  }
  return age === 'all'
    ? 'No token is on its bonding curve.'
    : `No token on its bonding curve launched in ${WINDOW[age]}.`;
}

/** Volume leads under the Volume sort, and the last buy under Recent buys. */
function cardShows(sort: ExploreSort): CardShows {
  return {
    figure: sort === 'volume' ? 'volume' : 'market-cap',
    time: sort === 'recent-buys' ? 'last-buy' : 'launch',
  };
}

const grid = (tokens: LaunchToken[], emptyMessage: string): TokenGridView =>
  tokens.length === 0 ? { status: 'empty', message: emptyMessage } : { status: 'ready', tokens };

/**
 * No answer to draw: loading before the first, or unavailable while the route fails. A failed poll
 * hides the cards it can no longer vouch for, which after a new sort or page would be the old
 * ones; the next poll that lands brings them back.
 */
const pending = (error: unknown): TokenList => ({
  count: null,
  pageCount: null,
  grid: error ? { status: 'unavailable' } : { status: 'loading' },
});

/** The Graduated grid from its query's latest answer and error, as of `nowMs`. */
export function graduatedList({ data, error }: ListQuery<GraduatedPage>, nowMs: number): TokenList {
  if (!data || error) return pending(error);
  const tokens = data.tokens.map((token) => launchToken(token, { nowMs }));
  return {
    count: countFormat.format(data.total),
    pageCount: pageCount(data),
    grid: grid(tokens, 'No token has graduated yet.'),
  };
}

/**
 * The Explore grid from its query's latest answer and error, as of `nowMs`. Cards and the empty
 * message follow the sort and age the answer was read for, which while a new sort loads is still
 * the old one.
 */
export function exploreList({ data, error }: ListQuery<ExplorePage>, nowMs: number): TokenList {
  if (!data || error) return pending(error);
  const tokens = data.tokens.map((token) => launchToken(token, { shows: cardShows(data.sort), nowMs }));
  return {
    count: countFormat.format(data.launched),
    pageCount: pageCount(data),
    grid: grid(tokens, emptyExploreMessage(data.sort, data.age)),
  };
}

export function useGraduatedList(page: number, pageSize: number): TokenList {
  const { data, error } = useQuery(graduatedQuery(page, pageSize));
  const nowMs = useNow(LIST_REFRESH_MS);
  return useMemo(() => graduatedList({ data, error }, nowMs), [data, error, nowMs]);
}

export function useExploreList(filters: ExploreFilters): TokenList {
  const { data, error } = useQuery(exploreQuery(filters));
  const nowMs = useNow(LIST_REFRESH_MS);
  return useMemo(() => exploreList({ data, error }, nowMs), [data, error, nowMs]);
}
