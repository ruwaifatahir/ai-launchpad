import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { isAddressEqual, type Address } from 'viem';
import { describeAgentError, LOCKED_POLL_MS, useAgent } from '@/entities/agent';
import { GraduationPhase, useLaunchRecord, type LaunchRecord } from '@/entities/token';
import { ConnectWalletButton, useConnectedAddress, useSessionGate } from '@/features/connect-wallet';
import { ApiError } from '@/shared/api';
import { routes, supportedNetwork } from '@/shared/config';
import { AgentNotice, AgentShell } from './AgentShell';
import { AgentWorkspace } from './AgentWorkspace';

const ONLY_THE_CREATOR = 'Only the wallet that launched this token can manage its agent.';

/** `/launchpad/:address/agent`: where a token's Creator shapes its Agent. */
export function AgentPage() {
  const { address } = useParams();
  // Re-read now and then, so a token Rescued during the visit says so.
  const record = useLaunchRecord(address, { refreshMs: LOCKED_POLL_MS });

  let content: ReactNode;
  if (record.status === 'loading') {
    content = <AgentNotice title="Loading token…" busy />;
  } else if (record.status === 'error') {
    content = (
      <AgentNotice title="Couldn't load this token">
        <p>The network didn't answer. Check your connection and try again.</p>
        <NoticeButton onClick={record.retry}>Try again</NoticeButton>
      </AgentNotice>
    );
  } else if (record.launch === null) {
    content = (
      <AgentNotice title="Token not found">
        <p>No token launched on AI Launchpad lives at this address.</p>
        <Link to={routes.launchpad}>Explore launched tokens</Link>
      </AgentNotice>
    );
  } else {
    content = <CreatorGate launch={record.launch} />;
  }

  const token = record.status === 'ready' ? record.launch?.token : undefined;
  return <AgentShell token={token}>{content}</AgentShell>;
}

/** Lets only the wallet that launched the token through, once it has a Session. Follows every wallet change. */
function CreatorGate({ launch }: { launch: LaunchRecord }) {
  const gate = useSessionGate();
  const connected = useConnectedAddress();

  if (gate.kind === 'settling') return <AgentNotice title="Checking your wallet…" busy />;
  if (connected === undefined) {
    return (
      <AgentNotice title="Your agent">
        <p>{ONLY_THE_CREATOR} Connect it to continue.</p>
        <div className="agent-notice-action">
          <ConnectWalletButton />
        </div>
      </AgentNotice>
    );
  }
  // A wallet that could never manage it gets no step to take, only the way back.
  if (!isAddressEqual(connected, launch.deployer)) return <NotTheCreator token={launch.token} />;
  if (gate.kind === 'switch-network') {
    return (
      <AgentNotice title="Your agent">
        <p>Switch to {supportedNetwork.name} to manage this token's agent.</p>
        <NoticeButton onClick={gate.open} disabled={gate.switching}>
          {gate.switching ? 'Switching…' : `Switch to ${supportedNetwork.name}`}
        </NoticeButton>
      </AgentNotice>
    );
  }
  if (gate.kind !== 'ready') {
    return (
      <AgentNotice title="Your agent">
        <p>{ONLY_THE_CREATOR} Sign in with it to continue.</p>
        <NoticeButton onClick={gate.open}>Sign in</NoticeButton>
      </AgentNotice>
    );
  }
  // Keyed so another wallet, or another token, starts from its own reads and an untouched form.
  return (
    <CreatorAgent
      key={`${launch.token}:${gate.address}`}
      token={launch.token}
      wallet={gate.address}
      rescued={launch.phase === GraduationPhase.Rescued}
    />
  );
}

function CreatorAgent({ token, wallet, rescued }: { token: Address; wallet: Address; rescued: boolean }) {
  const agent = useAgent(token, wallet, true);

  if (agent.data) return <AgentWorkspace token={token} wallet={wallet} agent={agent.data} rescued={rescued} />;
  if (agent.isPending) return <AgentNotice title="Reading your agent…" busy />;
  if (agent.error instanceof ApiError && agent.error.status === 403) return <NotTheCreator token={token} />;

  const { message, retryable } = describeAgentError(agent.error);
  return (
    <AgentNotice title="Couldn't read your agent">
      <p>{message}.</p>
      {retryable && (
        <NoticeButton onClick={() => void agent.refetch()} disabled={agent.isFetching}>
          {agent.isFetching ? 'Trying again…' : 'Try again'}
        </NoticeButton>
      )}
    </AgentNotice>
  );
}

function NotTheCreator({ token }: { token: Address }) {
  return (
    <AgentNotice title="Your agent">
      <p>{ONLY_THE_CREATOR}</p>
      <Link to={routes.token(token)}>Back to the token</Link>
    </AgentNotice>
  );
}

function NoticeButton(props: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" className="agent-button" {...props} />;
}
