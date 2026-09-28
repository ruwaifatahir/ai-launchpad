import { personaComplete, type Agent } from './agent';
import type { XConnection } from './x-connection';

/** Where an Agent stands, in the order the backend acts on: the first that holds wins. */
export type AgentState =
  | 'stopped'
  | 'rescued'
  | 'locked'
  | 'paused'
  | 'unfinished'
  | 'reading-x'
  | 'x-unreadable'
  | 'needs-consent'
  | 'needs-authorization'
  | 'disconnected'
  | 'needs-attestation'
  | 'posting';

export type AgentStatus = {
  state: AgentState;
  label: string;
  /** What the Pause/Resume toggle offers, or `hidden` when the Creator cannot change it. */
  toggle: 'hidden' | 'pause' | 'resume';
  /** Why a Preview cannot be written now, or `null` when it can. */
  previewBlocked: string | null;
};

type StatusContext = {
  /** From the launch record: the backend keeps a Rescued token's Agent Locked for good. */
  rescued: boolean;
  /** The Persona form differs from the saved Agent. A Preview reads only what is saved. */
  unsavedEdits?: boolean;
  /** The token's X connection, or `undefined` while it is being read. Only read once Unlocked. */
  connection?: XConnection | undefined;
  /** The X connection read failed, so `connection` will not arrive until it is tried again. */
  connectionUnreadable?: boolean;
};

/** The one X step left, or Posting once there is none. */
function xStatus(connection: XConnection | undefined, unreadable: boolean): Pick<AgentStatus, 'state' | 'label'> {
  if (connection === undefined && unreadable) return { state: 'x-unreadable', label: 'Couldn’t read the X connection' };
  if (connection === undefined) return { state: 'reading-x', label: 'Checking the X connection…' };
  switch (connection.outstandingGate) {
    case 'consent':
      return { state: 'needs-consent', label: 'Agree to the X terms' };
    case 'authorization':
      return connection.disconnected
        ? { state: 'disconnected', label: 'Disconnected from X' }
        : { state: 'needs-authorization', label: 'Connect X' };
    case 'attestation':
      return { state: 'needs-attestation', label: 'Finish X setup' };
    case null:
      return {
        state: 'posting',
        label: connection.xUsername ? `Posting as @${connection.xUsername}` : 'Posting to X',
      };
  }
}

/** The status of `agent`, and whether it may write a Preview. */
export function agentStatus(
  agent: Agent,
  { rescued, unsavedEdits = false, connection, connectionUnreadable = false }: StatusContext,
): AgentStatus {
  const paused = agent.pausedAt !== null;
  const complete = personaComplete(agent);

  let status: Omit<AgentStatus, 'previewBlocked'>;
  if (agent.stoppedAt !== null) {
    status = { state: 'stopped', label: 'Stopped by AI Launchpad', toggle: 'hidden' };
  } else if (rescued) {
    status = { state: 'rescued', label: 'This token was rescued, so its agent will never post', toggle: 'hidden' };
  } else if (agent.graduatedAt === null) {
    status = { state: 'locked', label: 'Locked until the Pool opens', toggle: paused ? 'resume' : 'pause' };
  } else if (paused) {
    status = { state: 'paused', label: 'Paused', toggle: 'resume' };
  } else if (!complete) {
    status = { state: 'unfinished', label: 'Finish the persona', toggle: 'pause' };
  } else {
    status = { ...xStatus(connection, connectionUnreadable), toggle: 'pause' };
  }

  // The backend's own refusals, in its order, then the one only the form knows. Pausing blocks nothing.
  let previewBlocked: string | null = null;
  if (status.state === 'stopped') previewBlocked = 'A stopped agent writes no previews';
  else if (status.state === 'rescued') previewBlocked = 'A rescued token’s agent writes no previews';
  else if (status.state === 'locked') previewBlocked = 'Previews open once the Pool opens';
  else if (!complete) previewBlocked = 'Finish the persona to preview it';
  else if (unsavedEdits) previewBlocked = 'Save to preview your changes';

  return { ...status, previewBlocked };
}
