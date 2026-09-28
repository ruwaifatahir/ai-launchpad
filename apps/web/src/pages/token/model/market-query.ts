import { ApiError } from '@/shared/api';

/** What a market route's section shows before it has an answer to draw. */
export type MarketQueryPending =
  | { status: 'loading' }
  /** Nothing to show yet, or a token the indexer has not reached yet: the Token page already knows it exists. */
  | { status: 'empty' }
  /** The indexer or the backend did not answer. Only that section says so; the rest of the page trades on. */
  | { status: 'unavailable' };

/** A market query with no answer yet: a 404 is a token with nothing yet, any other error is unavailable. */
export function pendingMarketQuery(error: unknown): MarketQueryPending {
  if (error instanceof ApiError && error.status === 404) return { status: 'empty' };
  if (error) return { status: 'unavailable' };
  return { status: 'loading' };
}

/** How many pages a paged market route has: at least one, so a page control never reads "of 0". */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
