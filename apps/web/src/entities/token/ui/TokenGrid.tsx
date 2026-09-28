import type { ReactNode } from 'react';
import { cx } from '@/shared/lib';
import type { TokenGridView } from '../model/token-grid';
import { TokenCard } from './TokenCard';

const GRID_STATUS: Record<Exclude<TokenGridView['status'], 'ready' | 'empty'>, string> = {
  loading: 'Loading tokens…',
  unavailable: 'Tokens cannot be loaded right now. Trying again every few seconds.',
};

/**
 * The cards, or a line saying why there are none. `emptyAction` follows an empty grid's message,
 * for a list that can point somewhere, such as a Creator's own Profile pointing at Create.
 */
export function TokenGrid({
  grid,
  eagerCount,
  emptyAction,
}: {
  grid: TokenGridView;
  eagerCount: number;
  emptyAction?: ReactNode;
}) {
  if (grid.status !== 'ready') {
    return (
      <div className={cx('launch-explore-status', grid.status === 'unavailable' && 'is-error')}>
        <p role="status">{grid.status === 'empty' ? grid.message : GRID_STATUS[grid.status]}</p>
        {grid.status === 'empty' && emptyAction}
      </div>
    );
  }
  return (
    <ul className="launch-explore-grid">
      {grid.tokens.map((token, index) => (
        <TokenCard key={token.address} token={token} priority={index < eagerCount} />
      ))}
    </ul>
  );
}
