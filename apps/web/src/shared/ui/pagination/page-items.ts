export type PageItem = { type: 'page'; page: number } | { type: 'gap'; after: number };

/**
 * First, last and the current page's neighbours, with gaps collapsed into ellipses.
 * On page 1 of 93: `1 2 … 93`. On page 40: `1 … 39 40 41 … 93`.
 */
export function getPageItems(page: number, pageCount: number): PageItem[] {
  const pages = new Set([1, page - 1, page, page + 1, pageCount]);
  if (page === 1) pages.add(2);
  if (page === pageCount) pages.add(pageCount - 1);

  const visible = [...pages].filter((p) => p >= 1 && p <= pageCount).toSorted((a, b) => a - b);
  const items: PageItem[] = [];
  let previous = 0;
  for (const current of visible) {
    // A gap of exactly one page shows that page instead of an ellipsis.
    if (current - previous === 2) items.push({ type: 'page', page: previous + 1 });
    else if (current - previous > 2) items.push({ type: 'gap', after: previous });
    items.push({ type: 'page', page: current });
    previous = current;
  }
  return items;
}
