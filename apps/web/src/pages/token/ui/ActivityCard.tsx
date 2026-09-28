import { useState } from 'react';
import * as Tabs from '@/shared/ui/tabs';
import { useHolders } from '../model/holders';
import { useRecentTrades } from '../model/recent-trades';
import type { TokenIdentity } from '../model/token-identity';
import { HoldersPanel } from './HoldersPanel';
import { RecentTradesPanel } from './RecentTradesPanel';

type ActivityTab = 'trades' | 'holders';

const COUNT = new Intl.NumberFormat('en-US');

function TabCount({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  return (
    <span className="token-activity-count">
      <span className="sr-only">, </span>
      {COUNT.format(value)}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export function ActivityCard({ identity }: { identity: TokenIdentity }) {
  const [tab, setTab] = useState<ActivityTab>('trades');
  const [tradesPage, setTradesPage] = useState(1);
  const [holdersPage, setHoldersPage] = useState(1);
  // Both read here, not in their panels, so each tab can show its count while the other is open.
  const trades = useRecentTrades(identity.address, tradesPage);
  const holders = useHolders(identity.address, holdersPage, tab === 'holders');

  return (
    <section className="token-activity-card" aria-label="Token activity">
      <Tabs.Root value={tab} onValueChange={setTab}>
        <header className="token-activity-header">
          <div className="token-activity-tabs tabs-pill">
            <Tabs.List className="tabs-list" aria-label="Token activity">
              <Tabs.Tab value="trades" className="tabs-tab">
                Recent trades
                <TabCount value={trades.status === 'ready' ? trades.total : null} label="trades" />
              </Tabs.Tab>
              <Tabs.Tab value="holders" className="tabs-tab">
                Holders
                <TabCount value={holders.status === 'ready' ? holders.holderCount : null} label="holders" />
              </Tabs.Tab>
            </Tabs.List>
          </div>
        </header>
        <div className="token-activity-panel">
          <Tabs.Panel value="trades">
            <RecentTradesPanel trades={trades} identity={identity} page={tradesPage} onPageChange={setTradesPage} />
          </Tabs.Panel>
          <Tabs.Panel value="holders">
            <HoldersPanel holders={holders} page={holdersPage} onPageChange={setHoldersPage} />
          </Tabs.Panel>
        </div>
      </Tabs.Root>
    </section>
  );
}
