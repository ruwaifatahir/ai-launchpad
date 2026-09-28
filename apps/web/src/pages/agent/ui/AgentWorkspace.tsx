import { useState } from 'react';
import type { Address } from 'viem';
import {
  agentStatus,
  usePauseAgent,
  useXConnection,
  type Agent,
  type AgentState,
  type AgentStatus,
} from '@/entities/agent';
import { TokenLogo } from '@/entities/token';
import { useTokenName } from '../api/token-name';
import { personaEdit, personaForm, type PersonaForm } from '../model/persona-edit';
import { useUnsavedGuard } from '../model/unsaved-guard';
import { PersonaEditor } from './PersonaEditor';
import { PreviewPanel } from './PreviewPanel';
import { XConnectionPanel } from './XConnectionPanel';

/** What each state means for the Creator, under its label. */
const stateDetails: Record<AgentState, string> = {
  stopped: 'An AI Launchpad admin silenced this agent. You can still edit its persona.',
  rescued: 'Its Pool will never open. You can still edit the persona, but nothing will be posted.',
  locked: 'It posts nothing until the token’s Pool opens. This page updates on its own when it does.',
  paused: 'It posts nothing until you resume it. Previews still work.',
  unfinished: 'It needs a name, personality, lore and style before it can post.',
  'reading-x': 'Posting starts once its X connection is finished.',
  'x-unreadable': 'Its X connection couldn’t be read. Try again below.',
  'needs-consent': 'It posts nothing until you agree to the X terms below.',
  'needs-authorization': 'It posts nothing until you connect its X account below.',
  disconnected: 'It posts nothing until you connect an X account again below.',
  'needs-attestation': 'It posts nothing until you finish the X setup below.',
  posting: 'It posts to X at the pace you set.',
};

type WorkspaceProps = { token: Address; wallet: Address; agent: Agent; rescued: boolean };

/** The Creator's view of their Agent: its status, its X connection, then the Persona form and the Preview panel side by side. */
export function AgentWorkspace({ token, wallet, agent, rescued }: WorkspaceProps) {
  const name = useTokenName(token);
  const [form, setForm] = useState<PersonaForm>(() => personaForm(agent));
  // Counts this visit's saves, so the Preview list can mark where the Persona changed.
  const [revision, setRevision] = useState(0);
  const edit = personaEdit(agent, form);
  const unsaved = edit.body !== null;
  // Every X connection route is a 409 until the Pool opens, and a Rescued token's never does.
  const unlocked = agent.graduatedAt !== null && !rescued;
  const connection = useXConnection(token, wallet, unlocked);
  const status = agentStatus(agent, {
    rescued,
    unsavedEdits: unsaved,
    connection: connection.data,
    connectionUnreadable: connection.isError,
  });
  useUnsavedGuard(unsaved);

  const title = name ? `${name.name} agent` : 'Your agent';

  return (
    <>
      <title>{`${title} · AI Launchpad`}</title>
      <section className="agent-panel agent-head" aria-labelledby="agent-title">
        <div className="agent-identity">
          <TokenLogo image={name?.logo ?? null} className="agent-logo" iconSize={20} priority />
          <div className="agent-identity-copy">
            <h1 id="agent-title">{title}</h1>
            <p translate="no" aria-busy={name === undefined || undefined}>
              {name ? `$${name.symbol}` : ' '}
            </p>
          </div>
        </div>
        <StatusBar token={token} wallet={wallet} status={status} />
      </section>

      {!rescued && (
        <XConnectionPanel
          token={token}
          wallet={wallet}
          unlocked={unlocked}
          connection={connection}
          unsavedEdits={unsaved}
        />
      )}

      <div className="agent-workspace">
        <PersonaEditor
          token={token}
          wallet={wallet}
          agent={agent}
          form={form}
          edit={edit}
          onChange={setForm}
          onSaved={(saved) => {
            setForm(personaForm(saved));
            setRevision((count) => count + 1);
          }}
        />
        <PreviewPanel
          token={token}
          wallet={wallet}
          author={agent.name}
          revision={revision}
          blocked={status.previewBlocked}
        />
      </div>
    </>
  );
}

type StatusBarProps = { token: Address; wallet: Address; status: AgentStatus };

/** One label for where the Agent stands, and the Pause/Resume toggle beside it when the Creator may use it. */
function StatusBar({ token, wallet, status: { state, label, toggle } }: StatusBarProps) {
  const pause = usePauseAgent(token, wallet);

  return (
    <div className="agent-status" data-state={state}>
      {/* Announced when the poll moves it on, such as the Pool opening. */}
      <div className="agent-status-copy" role="status">
        <p className="agent-status-label">{label}</p>
        <p className="agent-status-detail">{stateDetails[state]}</p>
      </div>
      {toggle !== 'hidden' && (
        <button
          type="button"
          className="agent-button"
          // Optimistic, so the label flips at once; a second click waits for the first to settle.
          disabled={pause.isPending}
          onClick={() => pause.mutate(toggle === 'pause')}
        >
          {toggle === 'pause' ? 'Pause agent' : 'Resume agent'}
        </button>
      )}
    </div>
  );
}
