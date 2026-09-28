import { Pagination } from '@/shared/ui/pagination';
import type { RecentTrades } from '../model/recent-trades';
import type { TokenIdentity } from '../model/token-identity';
import { ActivityPending } from './ActivityPending';
import { TradeRow } from './TradeRow';

const MESSAGES = {
  empty: 'No trades yet. The first buy shows up here.',
  unavailable: 'Trades are unavailable right now. Trading still works.',
};

type RecentTradesPanelProps = {
  trades: RecentTrades;
  identity: TokenIdentity;
  page: number;
  onPageChange: (page: number) => void;
};

export function RecentTradesPanel({ trades, identity, page, onPageChange }: RecentTradesPanelProps) {
  if (trades.status !== 'ready') {
    return <ActivityPending status={trades.status} loadingLabel="Loading trades…" messages={MESSAGES} />;
  }
  return (
    <>
      <ul className="token-trades-list">
        {trades.trades.map((trade) => (
          <TradeRow key={trade.id} trade={trade} symbol={identity.symbol} pair={identity.pair} />
        ))}
      </ul>
      {trades.pageCount > 1 && (
        <Pagination label="Recent trades pages" pageCount={trades.pageCount} page={page} onPageChange={onPageChange} />
      )}
    </>
  );
}
