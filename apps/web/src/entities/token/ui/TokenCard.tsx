import { Link } from 'react-router';
import { routes } from '@/shared/config';
import { shortenAddress } from '@/shared/lib';
import { ProgressBar } from '@/shared/ui/progress-bar';
import { RollingNumber } from '@/shared/ui/rolling-number';
import type { LaunchToken } from '../model/launch-token';
import { TokenLogo } from './TokenLogo';

type TokenCardProps = {
  token: LaunchToken;
  /** Above-the-fold card: load its image eagerly at high priority. */
  priority?: boolean;
};

export function TokenCard({ token, priority = false }: TokenCardProps) {
  const { address, image, graduated, name, ticker, figure, graduation, deployer, time } = token;

  return (
    <li data-launch-token={address}>
      <Link className="launch-card" to={routes.token(address)}>
        <span className="launch-card-head">
          <span aria-hidden="true">{shortenAddress(address)}</span>
          {graduated ? (
            <span className="launch-card-status is-graduated">Graduated</span>
          ) : (
            <span className="launch-card-status" aria-hidden="true">
              Bonding
            </span>
          )}
        </span>
        <span className="launch-card-media">
          <TokenLogo image={image} className="launch-card-logo" iconSize={28} priority={priority} />
        </span>
        <span className="launch-card-body">
          <span className="launch-card-name-row">
            <strong>{name}</strong>
          </span>
          <small>{ticker}</small>
          <span className="launch-card-mcap">
            <span className="launch-card-mcap-value">
              <RollingNumber value={figure.value} label={`${figure.value} ${figure.description}`} />
            </span>
            <span className="launch-card-mcap-label">{figure.label}</span>
          </span>
          {graduation !== null && (
            <span className="launch-card-graduation" aria-label={`${graduation.text} to graduation`}>
              <ProgressBar className="launch-card-grad-bar" percent={graduation.percent} />
              <span className="launch-card-grad-pct">{graduation.text}</span>
            </span>
          )}
          <span className="launch-card-meta">
            <span className="launch-card-deployer">{deployer}</span>
            <time
              className={time.recentBuy ? 'is-recent-buy' : undefined}
              dateTime={time.datetime}
              aria-label={`${time.recentBuy ? 'Last buy' : 'Launched'} ${time.text}`}
            >
              {time.text}
            </time>
          </span>
        </span>
      </Link>
    </li>
  );
}
