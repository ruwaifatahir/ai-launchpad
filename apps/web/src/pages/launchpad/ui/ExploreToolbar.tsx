import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { routes } from '@/shared/config';
import { PlusIcon, SearchIcon } from '@/shared/ui/icon';
import { SearchDialog } from './SearchDialog';

/** ⌘K, or Ctrl+K off a Mac, opens the search from anywhere on the page. */
function useSearchHotkey(setOpen: (open: boolean) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);
}

export function ExploreToolbar() {
  const [searching, setSearching] = useState(false);
  useSearchHotkey(setSearching);

  return (
    <header className="launch-explore-toolbar">
      <button
        type="button"
        className="launch-explore-search float"
        aria-label="Search tokens"
        aria-haspopup="dialog"
        aria-expanded={searching}
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setSearching(true)}
      >
        <SearchIcon />
        <span className="launch-explore-search-copy">Search tokens</span>
        <kbd className="launch-explore-kbd" aria-hidden="true">
          ⌘K
        </kbd>
      </button>
      <Link className="launch-explore-create-btn" to={routes.createToken}>
        <PlusIcon />
        <span>Create</span>
      </Link>
      {searching && <SearchDialog onClose={() => setSearching(false)} />}
    </header>
  );
}
