import { cx } from '@/shared/lib';
import './progress-bar.css';

/**
 * A solid bar filled to `percent`, on a track that reads against any panel. Decorative: the caller
 * shows the number, or gives its container `role="progressbar"`.
 *
 * Colours come from `--progress-fill` and `--progress-track` on any ancestor.
 */
export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const value = Math.min(100, Math.max(0, percent || 0));
  return (
    <span className={cx('progress-bar', className)} aria-hidden="true">
      {/* Any amount at all shows a sliver, so 0.3% doesn't read as nothing. */}
      <span className={cx('progress-bar-fill', value > 0 && 'is-started')} style={{ width: `${value}%` }} />
    </span>
  );
}
