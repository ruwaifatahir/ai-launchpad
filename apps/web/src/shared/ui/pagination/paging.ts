/** How many pages a paged list fills: at least one, so a page control never reads "of 0". */
export function pageCount(page: { total: number; pageSize: number }): number {
  return Math.max(1, Math.ceil(page.total / page.pageSize));
}

/**
 * The page to move to when `page` is past the end of a list that shrank since it was chosen, or
 * `null` to stay. `pages` is how many the list has, or `null` before its first answer.
 */
export function pageToMoveTo(page: number, pages: number | null): number | null {
  return pages !== null && page > pages ? pages : null;
}
