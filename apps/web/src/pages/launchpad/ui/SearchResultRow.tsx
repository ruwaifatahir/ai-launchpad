import { TokenLogo } from '@/entities/token';
import { cx } from '@/shared/lib';
import { ArrowUpRightIcon } from '@/shared/ui/icon';
import type { SearchResult } from '../model/token-search';

type SearchResultRowProps = {
  id: string;
  result: SearchResult;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
};

/** One result in the search dialog's listbox. */
export function SearchResultRow({ id, result, active, onHover, onChoose }: SearchResultRowProps) {
  const { image, name, ticker, graduated, figure, time } = result;
  return (
    // Per the WAI-ARIA combobox pattern the search box keeps focus and picks an option by keyboard
    // (aria-activedescendant), so an option takes neither focus nor keys: only the pointer here.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
    <div
      id={id}
      role="option"
      aria-selected={active}
      className={cx('spotlight-result', active && 'is-active')}
      onMouseMove={onHover}
      onClick={onChoose}
    >
      <TokenLogo image={image} className="spotlight-result-logo" iconSize={18} />
      <span className="spotlight-result-copy">
        <span className="spotlight-result-title-row">
          <span className="spotlight-result-title">{name}</span>
          {/* Status as the token cards show it: plain text, white once graduated, grey on the curve. */}
          <span className={cx('launch-search-status', graduated && 'is-graduated')}>
            {graduated ? 'Graduated' : 'Bonding'}
          </span>
        </span>
        <span className="spotlight-result-desc">
          {ticker} ·{' '}
          <span aria-label={`${figure.value} ${figure.description}`}>{`${figure.value} ${figure.label}`}</span> ·{' '}
          <time dateTime={time.datetime} aria-label={`Launched ${time.text}`}>
            {time.text}
          </time>
        </span>
      </span>
      <span className="spotlight-result-arrow" aria-hidden="true">
        <ArrowUpRightIcon />
      </span>
    </div>
  );
}
