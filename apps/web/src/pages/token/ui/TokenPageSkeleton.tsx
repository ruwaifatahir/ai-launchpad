import { cx } from '@/shared/lib';

/** One shimmering placeholder shape. */
function Bone({ className }: { className: string }) {
  return <span className={cx('skeleton', className)} aria-hidden="true" />;
}

function PanelSkeleton() {
  return (
    <div className="convert-panel token-skeleton-panel">
      <Bone className="token-skeleton-label" />
      <Bone className="token-skeleton-amount" />
      <div className="token-skeleton-panel-foot">
        <Bone className="token-skeleton-chip" />
        <Bone className="token-skeleton-balance" />
      </div>
    </div>
  );
}

/** The trade card and market card in outline, while the token is read from the chain. */
export function TokenPageSkeleton() {
  return (
    <div className="token-buy-layout" aria-busy="true">
      <title>Loading token · AI Launchpad</title>
      <span className="skeleton-sr" role="status">
        Loading token
      </span>
      <article className="convert-card token-buy-card">
        <div className="token-buy-header">
          <Bone className="token-skeleton-logo" />
          <div className="token-skeleton-identity">
            <Bone className="token-skeleton-name" />
            <Bone className="token-skeleton-symbol" />
          </div>
        </div>
        <div className="token-buy-trade-panel">
          <div className="convert-stack">
            <PanelSkeleton />
            <PanelSkeleton />
          </div>
          <Bone className="token-skeleton-button" />
        </div>
      </article>
      <section className="token-market-card">
        <div className="token-skeleton-stats">
          {['price', 'market-cap', 'price-in-pair', 'market'].map((stat) => (
            <div key={stat} className="token-skeleton-stat">
              <Bone className="token-skeleton-label" />
              <Bone className="token-skeleton-value" />
            </div>
          ))}
        </div>
        <Bone className="token-skeleton-chart" />
      </section>
    </div>
  );
}
