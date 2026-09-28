export const SORT_OPTIONS = [
  { value: 'recent-buys', label: 'Recent buys' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'market-cap', label: 'Market cap' },
  { value: 'volume', label: 'Volume' },
] as const;

export const AGE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
] as const;

/** How the Explore grid is ordered, as the explore route names it. */
export type ExploreSort = (typeof SORT_OPTIONS)[number]['value'];
/** How far back the Explore grid reaches. What falls inside depends on the sort. */
export type ListAge = (typeof AGE_OPTIONS)[number]['value'];

export const DEFAULT_SORT: ExploreSort = 'recent-buys';
export const DEFAULT_AGE: ListAge = 'all';

/** Below this width the grids have fewer columns, so each asks for a smaller page. */
export const COMPACT_LAYOUT = '(max-width: 1199px)';

/**
 * Cards per page for each grid and layout: whole rows of the grid, from the sizes the backend
 * allows (6, 10, 20, 24 or 50).
 */
export const PAGE_SIZE = {
  graduated: { wide: 10, compact: 6 },
  explore: { wide: 50, compact: 20 },
} as const;

/** How often the grids re-ask the backend, which holds each answer for five seconds. */
export const LIST_REFRESH_MS = 5_000;

/** Cards above the fold on a desktop viewport: their images load eagerly with high priority. */
export const EAGER_CARD_COUNT = { graduated: 10, explore: 15 } as const;
