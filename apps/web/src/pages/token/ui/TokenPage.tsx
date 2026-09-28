import type { ReactNode } from 'react';
import { preload } from 'react-dom';
import { Link, useParams } from 'react-router';
import { features, routes } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { useLaunchRecord, type LaunchRecord } from '@/entities/token';
import { useLaunchedToken } from '../api/launched-token';
import { REFRESH_MS } from '../config/refresh';
import { useDollarRate } from '../model/dollar-rate';
import { liveMarket } from '../model/market-stats';
import { ActivityCard } from './ActivityCard';
import { AgentCard } from './AgentCard';
import { CreatorFeesCard } from './CreatorFeesCard';
import { GraduationCard } from './GraduationCard';
import { MarketCard } from './MarketCard';
import { RescuedCard } from './RescuedCard';
import { TokenAboutCard } from './TokenAboutCard';
import { TokenPageSkeleton } from './TokenPageSkeleton';
import { TradeCard } from './TradeCard';
import './token.css';

export function TokenPage() {
  const { address } = useParams();
  const record = useLaunchRecord(address, { refreshMs: REFRESH_MS });

  let content: ReactNode;
  if (record.status === 'loading') content = <TokenPageSkeleton />;
  else if (record.status === 'error') content = <ErrorCard retry={record.retry} />;
  else if (record.launch === null) content = <NotFoundCard />;
  // Keyed so moving to another token starts from its own reads.
  else content = <LaunchedTokenView key={record.launch.token} launch={record.launch} />;

  return (
    <main className="bridge-main token-buy-main">
      <div className="bridge-shell token-buy-shell">
        <div className="token-buy-page">
          <Link className="token-buy-back" to={routes.launchpad}>
            Back to explore
          </Link>
          {content}
        </div>
      </div>
    </main>
  );
}

function LaunchedTokenView({ launch }: { launch: LaunchRecord }) {
  const token = useLaunchedToken(launch);
  const rate = useDollarRate(launch.token);
  if (token.status === 'loading') return <TokenPageSkeleton />;
  if (token.status === 'error') return <ErrorCard retry={token.retry} />;

  const { identity, stage, curveState, curve, pool } = token;
  // Start fetching the header logo before the image element mounts.
  if (identity.logo) preload(identity.logo, { as: 'image' });

  return (
    <>
      <title>{`${identity.name} ($${identity.symbol}) · AI Launchpad`}</title>
      <div className="token-buy-layout">
        {stage.kind === 'rescued' ? (
          <RescuedCard identity={identity} />
        ) : stage.kind === 'graduation-pending' ? (
          <GraduationCard identity={identity} stage={stage} />
        ) : (
          <TradeCard
            identity={identity}
            launch={launch}
            stage={stage}
            curveState={curveState}
            price={liveMarket(stage, curve, pool).market?.price ?? null}
            rate={rate}
          />
        )}
        <MarketCard identity={identity} stage={stage} curve={curve} pool={pool} rate={rate} />
      </div>
      <ActivityCard identity={identity} />
      <TokenAboutCard identity={identity} />
      <CreatorFeesCard identity={identity} />
      {features.agents && <AgentCard launch={launch} rescued={stage.kind === 'rescued'} />}
    </>
  );
}

function StatusCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="token-status-card">
      <title>{`${title} · AI Launchpad`}</title>
      <h1>{title}</h1>
      {children}
    </section>
  );
}

function NotFoundCard() {
  return (
    <StatusCard title="Token not found">
      <p>No token launched on AI Launchpad lives at this address.</p>
      <Link to={routes.launchpad}>Explore launched tokens</Link>
    </StatusCard>
  );
}

function ErrorCard({ retry }: { retry: () => void }) {
  return (
    <StatusCard title="Couldn't load this token">
      <p>The network didn't answer. Check your connection and try again.</p>
      <Button onClick={retry}>Try again</Button>
    </StatusCard>
  );
}
