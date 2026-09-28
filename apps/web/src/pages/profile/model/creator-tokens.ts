import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { launchToken, type TokenGridView } from '@/entities/token';
import { useNow } from '@/shared/lib';
import { pageCount } from '@/shared/ui/pagination';
import { creatorTokensQuery, type CreatorTokensPage } from '../api/creator-tokens';
import { PROFILE_REFRESH_MS } from '../config/profile-list';

/**
 * The Profile's list: how many tokens the wallet launched, how many pages they fill (at least one),
 * and the grid. Count and pages are `null` until the first answer.
 */
export type CreatorTokensList = { count: string | null; pageCount: number | null; grid: TokenGridView };

const countFormat = new Intl.NumberFormat('en-US');

function countText(total: number): string {
  if (total === 0) return 'No tokens launched';
  return `${countFormat.format(total)} ${total === 1 ? 'token' : 'tokens'} launched`;
}

/**
 * The list from its query's latest answer and error, as of `nowMs`. `own` is whether the Profile
 * is the Connected wallet's, which is spoken to rather than about. A failed poll hides the cards it
 * can no longer vouch for, as the launchpad's grids do.
 */
export function creatorTokensList(
  { data, error }: { data: CreatorTokensPage | undefined; error: unknown },
  { own, nowMs }: { own: boolean; nowMs: number },
): CreatorTokensList {
  if (!data || error) {
    return { count: null, pageCount: null, grid: error ? { status: 'unavailable' } : { status: 'loading' } };
  }
  const tokens = data.tokens.map((token) => launchToken(token, { nowMs }));
  const empty = own ? 'You haven’t launched a token yet.' : 'This wallet hasn’t launched a token yet.';
  return {
    count: countText(data.total),
    pageCount: pageCount(data),
    grid: tokens.length === 0 ? { status: 'empty', message: empty } : { status: 'ready', tokens },
  };
}

export function useCreatorTokensList(creator: string, page: number, own: boolean): CreatorTokensList {
  const { data, error } = useQuery(creatorTokensQuery(creator, page));
  const nowMs = useNow(PROFILE_REFRESH_MS);
  return useMemo(() => creatorTokensList({ data, error }, { own, nowMs }), [data, error, own, nowMs]);
}
