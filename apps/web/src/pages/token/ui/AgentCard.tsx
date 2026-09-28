import { Link } from 'react-router';
import { isAddressEqual, type Address } from 'viem';
import { agentStatus, describeAgentError, useAgent, useXConnection } from '@/entities/agent';
import type { LaunchRecord } from '@/entities/token';
import { useConnectedAddress, useSessionGate } from '@/features/connect-wallet';
import { routes, supportedNetwork } from '@/shared/config';

/**
 * The token's Agent at a glance, with the way in to manage it. Only the wallet that launched the
 * token sees it; the Creator wallet that only receives the fees does not.
 */
export function AgentCard({ launch, rescued }: { launch: LaunchRecord; rescued: boolean }) {
  const connected = useConnectedAddress();
  if (connected === undefined || !isAddressEqual(connected, launch.deployer)) return null;
  return <CreatorAgentCard token={launch.token} wallet={connected} rescued={rescued} />;
}

function CreatorAgentCard({ token, wallet, rescued }: { token: Address; wallet: Address; rescued: boolean }) {
  const gate = useSessionGate();
  const agent = useAgent(token, wallet, gate.kind === 'ready');
  // Read only once the Pool is open: before that the backend refuses it.
  const unlocked = agent.data !== undefined && agent.data.graduatedAt !== null && !rescued;
  const connection = useXConnection(token, wallet, gate.kind === 'ready' && unlocked);

  let status: { text: string; action?: { label: string; open: () => void; busy?: boolean } | undefined };
  if (gate.kind === 'sign-in') {
    status = { text: 'Sign in to see your agent', action: { label: 'Sign in', open: gate.open } };
  } else if (gate.kind === 'switch-network') {
    status = {
      text: `Switch to ${supportedNetwork.name} to see your agent`,
      action: { label: 'Switch network', open: gate.open, busy: gate.switching },
    };
  } else if (gate.kind !== 'ready' || agent.isPending) {
    status = { text: 'Reading your agent…' };
  } else if (agent.data) {
    status = {
      text: agentStatus(agent.data, {
        rescued,
        connection: connection.data,
        connectionUnreadable: connection.isError,
      }).label,
    };
  } else {
    const { message, retryable } = describeAgentError(agent.error);
    status = {
      text: message,
      action: retryable ? { label: 'Try again', open: () => void agent.refetch(), busy: agent.isFetching } : undefined,
    };
  }

  return (
    <section className="token-agent-card" aria-labelledby="token-agent-title">
      <div className="token-agent-copy">
        <h2 id="token-agent-title">Agent</h2>
        <p className="token-agent-status" aria-live="polite">
          {status.text}
        </p>
      </div>
      <div className="token-agent-actions">
        {status.action && (
          <button type="button" className="token-agent-link" onClick={status.action.open} disabled={status.action.busy}>
            {status.action.label}
          </button>
        )}
        <Link className="token-agent-link" to={routes.agent(token)}>
          Manage agent
        </Link>
      </div>
    </section>
  );
}
