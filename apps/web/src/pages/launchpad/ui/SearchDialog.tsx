import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { routes } from '@/shared/config';
import { cx } from '@/shared/lib';
import { CloseIcon, SearchIcon } from '@/shared/ui/icon';
import { pageToMoveTo } from '@/shared/ui/pagination';
import { AGE_OPTIONS, DEFAULT_AGE, type ListAge } from '../config/explore-filters';
import {
  DEFAULT_SEARCH_SORT,
  MAX_SEARCH_LENGTH,
  SEARCH_DEBOUNCE_MS,
  SEARCH_SORT_OPTIONS,
  type SearchSort,
} from '../config/search-filters';
import { useGridPage } from '../model/grid-page';
import { useActiveResult } from '../model/search-combobox';
import {
  useDebouncedValue,
  usePairOptions,
  useSearchView,
  type SearchResult,
  type SearchView,
} from '../model/token-search';
import { SearchFilterRow } from './SearchFilterRow';
import { SearchResultRow } from './SearchResultRow';

const STATUS_MESSAGE: Record<Extract<SearchView['status'], 'loading' | 'unavailable'>, string> = {
  loading: 'Searching…',
  unavailable: 'Search is unavailable right now. Trying again every few seconds.',
};

const NO_RESULTS: SearchResult[] = [];

/**
 * The token search, as a modal dialog. Typing searches every token by name, ticker or address;
 * an empty box lists them all. The box keeps focus, and up, down and enter pick a result.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const navigate = useNavigate();

  const [text, setText] = useState('');
  const [sort, setSort] = useState<SearchSort>(DEFAULT_SEARCH_SORT);
  const [age, setAge] = useState<ListAge>(DEFAULT_AGE);
  const [pair, setPair] = useState<string | null>(null);
  const q = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);
  const [page, setPage] = useGridPage(`${q.toLowerCase()}:${sort}:${age}:${pair ?? ''}`);

  const { view, stale } = useSearchView({ q, sort, age, pair, page });
  const pairs = usePairOptions();
  // Adjusting state while rendering, as React documents, so a page the results shrank past is left at once.
  const moveTo = view.status === 'empty' || view.status === 'ready' ? pageToMoveTo(page, view.pageCount) : null;
  if (moveTo !== null) setPage(moveTo);

  const results = view.status === 'ready' ? view.results : NO_RESULTS;
  const { activeIndex, active, move, highlight } = useActiveResult(results);
  // Results on screen but not yet for the text typed, or still the last page's, cannot be chosen by
  // keyboard: Enter would open a token from a search the visitor has moved on from.
  const settled = q === text.trim() && !stale;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    // Unmounting takes the dialog out of the page, which closes it too.
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    inputRef.current?.focus();
  }, []);

  // Keep the highlighted result in view as the arrow keys move it.
  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [listId, activeIndex]);

  // Every way out closes the dialog natively, so focus returns to what opened it, and its close
  // event unmounts it.
  const close = () => dialogRef.current?.close();

  const choose = (result: SearchResult | undefined) => {
    if (!result) return;
    close();
    navigate(routes.token(result.address));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter or an arrow while an input method composes a character belongs to the composition.
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 'down' : 'up');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (settled) choose(active);
    }
  };

  return (
    // A press on the backdrop lands on the dialog itself, whose content fills it edge to edge. A
    // press, not a click, so a text selection dragged out of the box does not close it. Pointer
    // only by design: the keyboard's way out is Escape, which a modal dialog handles natively.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      className="spotlight-panel launch-search"
      aria-label="Search tokens"
      onClose={onClose}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="launch-search-body">
        <div className="spotlight-input-row">
          <SearchIcon />
          <input
            ref={inputRef}
            className="spotlight-input"
            // Not type="search": Escape there clears the text before it closes the dialog.
            type="text"
            enterKeyHint="search"
            role="combobox"
            aria-label="Search by name, ticker or address"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
            placeholder="Search by name, ticker or address"
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX_SEARCH_LENGTH}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="spotlight-close" aria-label="Close search" onClick={close}>
            <CloseIcon />
          </button>
        </div>

        <div className="spotlight-filters">
          <SearchFilterRow label="Sort" options={SEARCH_SORT_OPTIONS} value={sort} onChange={setSort} />
          <SearchFilterRow label="Age" options={AGE_OPTIONS} value={age} onChange={setAge} />
          <SearchFilterRow
            label="Pair"
            options={pairs}
            value={pair}
            onChange={setPair}
            className="spotlight-pair-options"
          />
        </div>

        {view.status === 'ready' ? (
          <div id={listId} className="spotlight-results" role="listbox" aria-label="Tokens">
            {view.results.map((result, index) => (
              <SearchResultRow
                key={result.address}
                id={optionId(index)}
                result={result}
                active={index === activeIndex}
                onHover={() => highlight(index)}
                onChoose={() => choose(result)}
              />
            ))}
          </div>
        ) : (
          <div id={listId} className="spotlight-results">
            <p className={cx('spotlight-empty', view.status === 'unavailable' && 'is-error')} role="status">
              {view.status === 'empty' ? view.message : STATUS_MESSAGE[view.status]}
            </p>
          </div>
        )}

        {view.status === 'ready' && (
          <footer className="spotlight-pagination">
            <span role="status">{view.paging.range}</span>
            <div className="spotlight-page-actions">
              <button
                type="button"
                className="spotlight-page-button"
                disabled={!view.paging.hasPrevious}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="spotlight-page-button"
                disabled={!view.paging.hasNext}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </footer>
        )}
      </div>
    </dialog>
  );
}
