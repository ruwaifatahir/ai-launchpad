import { useState } from 'react';
import { DetailList, DetailListItem } from '@/shared/ui/detail-list';
import { ProgressBar } from '@/shared/ui/progress-bar';
import { RollingNumber } from '@/shared/ui/rolling-number';
import * as Tabs from '@/shared/ui/tabs';
import { formatPairAmount } from '@/shared/lib';
import { CHART_RANGES, DEFAULT_CHART_RANGE, type ChartRange } from '../config/chart-ranges';
import type { CurveMarket } from '../model/curve-market';
import { markAt, useMarketChart, type ChartMark, type MarketChart } from '../model/market-chart';
import { marketStats } from '../model/market-stats';
import type { PoolMarket } from '../model/pool-market';
import type { TokenIdentity } from '../model/token-identity';
import type { TokenStage } from '../model/token-stage';
import { MarketChartPlot } from './MarketChartPlot';

const CHART_MESSAGE: Record<Exclude<MarketChart['status'], 'ready' | 'empty'>, string> = {
  loading: 'Loading chart…',
  unavailable: 'The chart is unavailable right now. Trading still works.',
};

/** What an empty chart says for each range. */
const EMPTY_MESSAGE: Record<ChartRange, string> = {
  '5m': 'No trades in the last 5 minutes.',
  '1h': 'No trades in the last hour.',
  '6h': 'No trades in the last 6 hours.',
  '1d': 'No trades in the last day.',
  all: 'No trades yet. The chart starts at the first buy.',
};

/** An empty range points at the whole history, where any trade at all shows. */
function EmptyChart({ range, onShowAll }: { range: ChartRange; onShowAll: () => void }) {
  return (
    <div className="noxa-chart-empty token-chart-empty" role="status">
      <p>{EMPTY_MESSAGE[range]}</p>
      {range !== 'all' && (
        <button type="button" className="token-chart-empty-action" onClick={onShowAll}>
          Show all trades
        </button>
      )}
    </div>
  );
}

/** "X of Y {Paired asset} raised" towards Graduation, with a bar filled to the percentage. */
function GraduationProgress({ progress, pairSymbol }: { progress: CurveMarket['progress']; pairSymbol: string }) {
  const raised = `${formatPairAmount(progress.raised)} of ${formatPairAmount(progress.target)} ${pairSymbol} raised`;
  return (
    <div
      className="token-graduation"
      role="progressbar"
      aria-label="Graduation progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress.percent}
      aria-valuetext={raised}
    >
      <span className="token-graduation-label">Graduation progress</span>
      <ProgressBar className="token-graduation-bar" percent={progress.percent} />
      <span className="token-graduation-percent">{progress.percent.toFixed(2)}%</span>
      <span className="token-graduation-raised">{raised}</span>
    </div>
  );
}

export function MarketCard({
  identity,
  stage,
  curve,
  pool,
  rate,
}: {
  identity: TokenIdentity;
  stage: TokenStage;
  curve: CurveMarket | null;
  pool: PoolMarket | null;
  /** The Paired asset's Dollar rate, or `null` to show every figure in the Paired asset. */
  rate: number | null;
}) {
  const { pair } = identity;
  const stats = marketStats(stage, curve, pool, { symbol: pair.symbol, rate });
  const [range, setRange] = useState<ChartRange>(DEFAULT_CHART_RANGE);
  const chart = useMarketChart(identity.address, range);
  // The moment under the cursor, `null` with no cursor, kept by time so it stays put as the chart
  // refreshes. A plain value, so moving within one mark sets the same state and redraws nothing.
  const [scrubAt, setScrubAt] = useState<ChartMark['t'] | null>(null);
  const marks = chart.status === 'ready' ? chart.chart.marks : null;
  const scrubIndex = scrubAt !== null && marks ? markAt(marks, scrubAt) : null;
  const scrubbed = scrubIndex === null ? null : marks![scrubIndex]!;
  const showRange = (next: ChartRange) => {
    setScrubAt(null);
    setRange(next);
  };

  return (
    <section className="token-market-card">
      <DetailList className="token-market-stats">
        <DetailListItem term="Price">{stats.price}</DetailListItem>
        <DetailListItem term="Market cap">{stats.marketCap}</DetailListItem>
        <DetailListItem term={`Price in ${pair.symbol}`}>{stats.priceInPair}</DetailListItem>
        <DetailListItem term="Market">{stats.venue}</DetailListItem>
      </DetailList>
      {stage.kind === 'bonding-curve' && curve ? (
        <GraduationProgress progress={curve.progress} pairSymbol={pair.symbol} />
      ) : null}
      <div className="noxa-chart token-market-chart">
        <Tabs.Root value={range} onValueChange={showRange}>
          <div className="noxa-chart-head">
            <div className="noxa-chart-price-block">
              <p className="noxa-chart-price">
                {chart.status === 'ready' ? (
                  <RollingNumber
                    value={scrubbed?.marketCap ?? chart.marketCap}
                    label={scrubbed?.marketCap ?? chart.marketCap}
                    className="noxa-chart-price-roll"
                  />
                ) : (
                  // With no chart for this range, the headline still shows the market cap read from the chain.
                  stats.marketCap
                )}
              </p>
              {scrubbed ? (
                <p className="noxa-chart-change is-scrubbing">{scrubbed.time}</p>
              ) : (
                chart.status === 'ready' &&
                chart.change && (
                  <p className={`noxa-chart-change is-${chart.change.direction}`}>
                    {chart.change.text}
                    <span className="noxa-chart-change-range">{range}</span>
                  </p>
                )
              )}
            </div>
            <Tabs.List className="noxa-chart-ranges" aria-label="Chart range">
              {CHART_RANGES.map((option) => (
                <Tabs.Tab key={option} value={option} className="noxa-chart-range">
                  {option.toUpperCase()}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </div>
          {/* One panel every range redraws. */}
          <Tabs.Panel className="noxa-chart-stage">
            {chart.status === 'ready' ? (
              <MarketChartPlot
                chart={chart.chart}
                symbol={identity.symbol}
                activeIndex={scrubIndex}
                onScrub={(mark) => setScrubAt(mark ? mark.t : null)}
              />
            ) : chart.status === 'empty' ? (
              <EmptyChart range={range} onShowAll={() => showRange('all')} />
            ) : (
              <p className="noxa-chart-empty" role="status">
                {CHART_MESSAGE[chart.status]}
              </p>
            )}
          </Tabs.Panel>
        </Tabs.Root>
      </div>
    </section>
  );
}
