import { Pagination } from '@/shared/ui/pagination';
import type { Holders } from '../model/holders';
import { ActivityPending } from './ActivityPending';
import { HolderRow } from './HolderRow';

const MESSAGES = {
  empty: 'No holders yet. The first buyer shows up here.',
  unavailable: 'Holders are unavailable right now. Trading still works.',
};

type HoldersPanelProps = {
  holders: Holders;
  page: number;
  onPageChange: (page: number) => void;
};

export function HoldersPanel({ holders, page, onPageChange }: HoldersPanelProps) {
  if (holders.status !== 'ready') {
    return <ActivityPending status={holders.status} loadingLabel="Loading holders…" messages={MESSAGES} />;
  }
  return (
    <>
      <div className="token-holder-table-wrap">
        {/* ARIA table roles on a CSS grid, not a <table>: some browsers drop a table's semantics once its rows are laid out as grid. */}
        <div className="token-holder-table" role="table" aria-label="Holders">
          <div className="token-holder-row v2-token-holder-row is-head" role="row">
            <span role="columnheader">
              <span aria-hidden="true">#</span>
              <span className="sr-only">Rank</span>
            </span>
            <span role="columnheader">Wallet</span>
            <span role="columnheader">Share of supply</span>
            <span role="columnheader">Balance</span>
          </div>
          {holders.holders.map((holder) => (
            <HolderRow key={holder.wallet} holder={holder} />
          ))}
        </div>
      </div>
      <p className="token-holder-note">The launchpad&rsquo;s own contracts are listed but not counted as holders.</p>
      {holders.pageCount > 1 && (
        <Pagination label="Holders pages" pageCount={holders.pageCount} page={page} onPageChange={onPageChange} />
      )}
    </>
  );
}
