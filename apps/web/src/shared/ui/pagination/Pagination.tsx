import { cx, useControllableState, useSlidingIndicator } from '@/shared/lib';
import { ChevronLeftIcon, ChevronRightIcon } from '@/shared/ui/icon';
import { getPageItems } from './page-items';

type PaginationProps = {
  /** Accessible name of the navigation landmark, e.g. "Explore token pages". */
  label: string;
  pageCount: number;
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  className?: string;
};

export function Pagination({ label, pageCount, page, defaultPage = 1, onPageChange, className }: PaginationProps) {
  const [current, setPage] = useControllableState({ value: page, defaultValue: defaultPage, onChange: onPageChange });
  const { listRef, indicatorRef } = useSlidingIndicator<HTMLDivElement>('[aria-current="page"]', current);

  return (
    <nav className={cx('page-control', className)} aria-label={label}>
      <button
        type="button"
        className="page-control-nav"
        aria-label="Previous page"
        disabled={current <= 1}
        onClick={() => setPage(current - 1)}
      >
        <ChevronLeftIcon />
      </button>
      <div ref={listRef} className="page-control-list" role="group" aria-label="Pages">
        <span ref={indicatorRef} className="page-control-indicator" aria-hidden="true" />
        {getPageItems(current, pageCount).map((item) => {
          if (item.type === 'gap') {
            return (
              <span key={`gap-${item.after}`} className="page-control-ellipsis" aria-hidden="true">
                …
              </span>
            );
          }
          const isCurrent = item.page === current;
          return (
            <button
              key={item.page}
              type="button"
              className={cx('page-control-page', isCurrent && 'is-active')}
              aria-label={`Page ${item.page}`}
              aria-current={isCurrent ? 'page' : undefined}
              onClick={() => setPage(item.page)}
            >
              {item.page}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="page-control-nav"
        aria-label="Next page"
        disabled={current >= pageCount}
        onClick={() => setPage(current + 1)}
      >
        <ChevronRightIcon />
      </button>
    </nav>
  );
}
