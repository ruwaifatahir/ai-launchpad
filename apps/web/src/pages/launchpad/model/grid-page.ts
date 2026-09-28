import { useCallback, useState } from 'react';

/**
 * A grid's current page, back to 1 whenever `key` changes: a new sort, age or page size lists
 * different tokens, so the old page number means nothing.
 */
export function useGridPage(key: string) {
  const [state, setState] = useState({ key, page: 1 });
  const page = state.key === key ? state.page : 1;
  const setPage = useCallback((next: number) => setState({ key, page: next }), [key]);
  return [page, setPage] as const;
}
