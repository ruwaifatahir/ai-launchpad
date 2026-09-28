import { useState } from 'react';
import { formatCompactAmount, formatCompactDollars } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { pendingStats, useAnalytics, type Range } from '../model/analytics';
import { DailyBarChart } from './DailyBarChart';
import { RangeToggle } from './RangeToggle';
import { StatTile } from './StatTile';
import './analytics.css';

export function AnalyticsPage() {
  const [range, setRange] = useState<Range>('24h');
  const analytics = useAnalytics(range);
  const view = analytics.status === 'ready' ? analytics.view : null;

  return (
    <main className="bridge-main">
      <title>Analytics · AI Launchpad</title>
      <div className="analytics-page-shell">
        <section className="analytics-overview analytics-reveal">
          <header className="analytics-hero">
            <div>
              <h1>Protocol analytics</h1>
              {view?.dateLabel ? <small className="analytics-updated">{view.dateLabel}</small> : null}
            </div>
            <div className="analytics-hero-actions">
              <RangeToggle range={range} onChange={setRange} />
            </div>
          </header>
          {analytics.status === 'error' ? (
            <div className="analytics-error" role="alert">
              <p>The analytics didn&apos;t load. The indexer may be busy, so try again in a moment.</p>
              <Button onClick={analytics.retry}>Try again</Button>
            </div>
          ) : (
            <section
              className="analytics-stats analytics-dune-stats"
              aria-label="Launchpad metrics"
              aria-busy={analytics.status === 'loading'}
            >
              {(view?.stats ?? pendingStats(range)).map((stat) => (
                <StatTile key={stat.label} stat={stat} />
              ))}
            </section>
          )}
        </section>

        {view ? (
          <div className="analytics-chart-grid analytics-reveal">
            <DailyBarChart title="Trading volume" points={view.volume} formatValue={formatCompactDollars} />
            <DailyBarChart
              title="Token launches"
              points={view.launches}
              formatValue={formatCompactAmount}
              valueSuffix=" launches"
            />
          </div>
        ) : null}

        <p className="analytics-legal-note">
          Figures come from the AI Launchpad indexer and stop at the end of the latest complete UTC day. The 24h view is
          that day, compared with the day before. Volume is buys and sells together, each day converted to US dollars at
          that day&apos;s closing Chainlink rate. A dash is a figure with no dollar rate yet.
          {view && view.unpricedSymbols.length > 0
            ? ` Trading against ${view.unpricedSymbols.join(', ')} is in no dollar figure: it has no rate source.`
            : null}
        </p>
      </div>
    </main>
  );
}
