export const SEARCH_SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'market-cap', label: 'Market cap' },
  { value: 'volume', label: 'Volume' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
] as const;

/** How search results are ordered, as the search route names it. */
export type SearchSort = (typeof SEARCH_SORT_OPTIONS)[number]['value'];

export const DEFAULT_SEARCH_SORT: SearchSort = 'relevance';

/** Results per page: the search route's own default, from the sizes it allows. */
export const SEARCH_PAGE_SIZE = 24;

/** The search route refuses longer text. */
export const MAX_SEARCH_LENGTH = 64;

/** How long typing pauses before the text is searched, so each keystroke is not a request. */
export const SEARCH_DEBOUNCE_MS = 200;
