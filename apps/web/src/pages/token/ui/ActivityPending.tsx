import type { MarketQueryPending } from '../model/market-query';

/** As many placeholder rows as a short page, so the card barely moves when rows land. */
const PLACEHOLDER_ROWS = 5;

type ActivityPendingProps = {
  status: MarketQueryPending['status'];
  /** Announced while placeholder rows stand in for the first read. */
  loadingLabel: string;
  /** What the tab says when it has no rows to show. */
  messages: Record<Exclude<MarketQueryPending['status'], 'loading'>, string>;
};

/** An activity tab before it has rows: placeholder rows while loading, otherwise one line saying why. */
export function ActivityPending({ status, loadingLabel, messages }: ActivityPendingProps) {
  if (status === 'loading') {
    return (
      <div className="token-activity-loading" aria-busy="true">
        <span className="skeleton-sr" role="status">
          {loadingLabel}
        </span>
        {Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
          <div key={index} className="token-activity-placeholder" aria-hidden="true">
            <span className="skeleton skeleton-text token-activity-placeholder-main" />
            <span className="skeleton skeleton-text token-activity-placeholder-side" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <p className="token-activity-empty" role="status">
      {messages[status]}
    </p>
  );
}
