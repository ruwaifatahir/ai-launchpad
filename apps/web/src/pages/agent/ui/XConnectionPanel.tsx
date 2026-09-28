import { useId, useState, type ReactNode } from 'react';
import {
  describeAgentError,
  useAttestX,
  useAuthorizeX,
  useDisconnectX,
  type ConnectionGate,
  type XConnection,
} from '@/entities/agent';
import { ApiError } from '@/shared/api';
import { externalLinks } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { ConsentDialog } from './ConsentDialog';

type Query<T> = {
  data: T | undefined;
  isPending: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => unknown;
};

type PanelProps = {
  token: string;
  wallet: string;
  /** Whether the token's Pool is open. Before that the backend refuses every X connection route. */
  unlocked: boolean;
  connection: Query<XConnection>;
  /** The Persona form has unsaved edits, which leaving for X would lose. */
  unsavedEdits: boolean;
};

const STEPS: { gate: Exclude<ConnectionGate, null>; name: string }[] = [
  { gate: 'consent', name: 'Agree to the terms' },
  { gate: 'authorization', name: 'Connect X' },
  { gate: 'attestation', name: 'Finish X setup' },
];

/** The Agent's X connection: the one step left, in order, or the connected account once all three are done. */
export function XConnectionPanel({ token, wallet, unlocked, connection, unsavedEdits }: PanelProps) {
  let body: ReactNode;
  if (!unlocked) {
    body = <p className="agent-x-note">Connect X once the Pool opens.</p>;
  } else if (connection.data) {
    body =
      connection.data.outstandingGate === null ? (
        <Connected token={token} wallet={wallet} connection={connection.data} />
      ) : (
        <Steps token={token} wallet={wallet} connection={connection.data} unsavedEdits={unsavedEdits} />
      );
  } else if (connection.isPending) {
    body = (
      <p className="agent-x-note" aria-busy="true">
        Checking the X connection…
      </p>
    );
  } else {
    body = <ReadFailure error={connection.error} retry={connection.refetch} busy={connection.isFetching} />;
  }

  return (
    <section className="agent-panel agent-x" aria-labelledby="agent-x-title">
      <header className="agent-panel-head">
        <h2 id="agent-x-title">X connection</h2>
        <p>Your agent posts to an X account you already own. It posts nothing until every step is done.</p>
      </header>
      {body}
    </section>
  );
}

type StepProps = { token: string; wallet: string; connection: XConnection };

/** The three steps as a list, with only the outstanding one open. */
function Steps({ token, wallet, connection, unsavedEdits }: StepProps & { unsavedEdits: boolean }) {
  const current = STEPS.findIndex((step) => step.gate === connection.outstandingGate);

  return (
    <ol className="agent-x-steps">
      {STEPS.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'next';
        return (
          <li
            key={step.gate}
            className="agent-x-step"
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <div className="agent-x-step-head">
              <span className="agent-x-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.name}</h3>
              <span className="agent-x-step-state">
                {state === 'done' ? 'Done' : state === 'next' ? 'Not yet' : 'Now'}
              </span>
            </div>
            {state === 'current' && (
              <div className="agent-x-step-body">
                {step.gate === 'consent' && <ConsentStep token={token} wallet={wallet} connection={connection} />}
                {step.gate === 'authorization' && (
                  <AuthorizeStep token={token} wallet={wallet} connection={connection} unsavedEdits={unsavedEdits} />
                )}
                {step.gate === 'attestation' && <AttestStep token={token} wallet={wallet} connection={connection} />}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** One line on the page; the wording itself, and the only way to agree, are in the dialog. */
function ConsentStep({ token, wallet, connection }: StepProps) {
  const [reviewing, setReviewing] = useState(false);
  // Still connected while asked again: the wording changed under a working Agent.
  const again = connection.xUsername !== null;

  return (
    <>
      <p className="agent-x-lead">
        {again ? (
          <>
            The terms changed. Review them and agree again to keep posting as <Handle name={connection.xUsername} />.
          </>
        ) : (
          'See exactly what your agent will and won’t do on your X account.'
        )}
      </p>
      <div className="agent-x-step-action">
        <Button className="agent-x-action" aria-haspopup="dialog" onClick={() => setReviewing(true)}>
          Review and agree
        </Button>
      </div>
      {reviewing && <ConsentDialog token={token} wallet={wallet} onClose={() => setReviewing(false)} />}
      {/* An account still on it can be taken off without agreeing again. */}
      {again && <Disconnect token={token} wallet={wallet} connection={connection} />}
    </>
  );
}

/** Leaves for X's own screen. Not while the Persona has unsaved edits, since leaving would lose them. */
function AuthorizeStep({ token, wallet, connection, unsavedEdits }: StepProps & { unsavedEdits: boolean }) {
  const authorize = useAuthorizeX(token, wallet);
  const noteId = useId();
  // Succeeding means the browser is on its way to X, so the button stays busy.
  const leaving = authorize.isPending || authorize.isSuccess;

  return (
    <>
      <p className="agent-x-lead">
        {connection.disconnected
          ? 'You disconnected X. Connect an account again to start posting.'
          : 'On X’s own screen, allow AI Launchpad to post to your account. X sends you back here after.'}
      </p>
      <StepAction
        failure={authorize.error}
        note={unsavedEdits ? { id: noteId, text: 'Save your persona first' } : undefined}
      >
        <Button
          className="agent-x-action"
          busy={leaving}
          disabled={unsavedEdits}
          aria-describedby={unsavedEdits ? noteId : undefined}
          onClick={() => authorize.mutate()}
        >
          {connection.disconnected ? 'Connect X again' : 'Connect X'}
        </Button>
      </StepAction>
    </>
  );
}

/** The two things only the Creator can do on X, each ticked before their word is sent. */
function AttestStep({ token, wallet, connection }: StepProps) {
  const attest = useAttestX(token, wallet);
  const [label, setLabel] = useState(false);
  const [bio, setBio] = useState(false);
  const handle = <Handle name={connection.xUsername} />;

  return (
    <>
      <p className="agent-x-lead">
        Do these two on X for {handle}. AI Launchpad can’t check them, so it takes your word.
      </p>
      <div className="agent-x-checks">
        <Check checked={label} onChange={setLabel}>
          I turned on X’s automated label.
        </Check>
        <Check checked={bio} onChange={setBio}>
          I linked my own X account in its bio.
        </Check>
      </div>
      {/* Outside the labels, so following it never ticks a box. */}
      <a className="agent-x-help" href={externalLinks.xAutomatedLabel} target="_blank" rel="noopener noreferrer">
        How to turn on X’s automated label (opens X Help)
      </a>
      <StepAction failure={attest.error}>
        <Button
          className="agent-x-action"
          busy={attest.isPending}
          disabled={!label || !bio}
          onClick={() => attest.mutate()}
        >
          Confirm
        </Button>
      </StepAction>
      <Disconnect token={token} wallet={wallet} connection={connection} />
    </>
  );
}

/** Every step done: the account, and the way off it. */
function Connected({ token, wallet, connection }: StepProps) {
  return (
    <div className="agent-x-connected">
      <div className="agent-x-account">
        <p className="agent-x-handle">
          <Handle name={connection.xUsername} />
        </p>
        <p className="agent-x-caption">Handle when connected</p>
      </div>
      <Disconnect token={token} wallet={wallet} connection={connection} />
    </div>
  );
}

/** Asks first, in place, as the Persona form does before clearing a part. */
function Disconnect({ token, wallet, connection }: StepProps) {
  const disconnect = useDisconnectX(token, wallet);
  const [asking, setAsking] = useState(false);
  const copyId = useId();
  const handle = <Handle name={connection.xUsername} />;

  if (!asking) {
    return (
      <button type="button" className="agent-button agent-x-disconnect" onClick={() => setAsking(true)}>
        Disconnect X
      </button>
    );
  }
  return (
    <div className="agent-confirm agent-x-confirm" role="alertdialog" aria-labelledby={copyId}>
      <p id={copyId}>Disconnect {handle}? The agent stops posting. Its past posts stay on X.</p>
      <div className="agent-confirm-actions">
        <button
          type="button"
          className="agent-button"
          disabled={disconnect.isPending}
          aria-busy={disconnect.isPending || undefined}
          onClick={() => disconnect.mutate(undefined, { onSettled: () => setAsking(false) })}
        >
          {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
        </button>
        <button type="button" className="agent-button" disabled={disconnect.isPending} onClick={() => setAsking(false)}>
          Keep connected
        </button>
      </div>
      <Failure error={disconnect.error} />
    </div>
  );
}

function Handle({ name }: { name: string | null }) {
  return <span translate="no">{name ? `@${name}` : 'your X account'}</span>;
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="agent-x-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** A step's one action, what stops it, and why it failed. */
function StepAction({
  failure,
  note,
  children,
}: {
  failure: Error | null;
  /** What stops the action, read out with it through its id. */
  note?: { id: string; text: string } | undefined;
  children: ReactNode;
}) {
  return (
    <div className="agent-x-step-action">
      {children}
      {note && (
        <p id={note.id} className="agent-x-note">
          {note.text}
        </p>
      )}
      <Failure error={failure} />
    </div>
  );
}

/** A 401 has already ended the Session, and the page asks for a sign in on its own. */
const sessionEnded = (error: Error | null) => error instanceof ApiError && error.status === 401;

function Failure({ error }: { error: Error | null }) {
  if (!error || sessionEnded(error)) return null;
  return (
    <p className="agent-failure" role="alert">
      {describeAgentError(error).message}.
    </p>
  );
}

function ReadFailure({ error, retry, busy }: { error: Error | null; retry: () => unknown; busy: boolean }) {
  if (sessionEnded(error)) return null;
  const { message, retryable } = describeAgentError(error);
  return (
    <div className="agent-x-step-action">
      <p className="agent-failure" role="alert">
        {message}.
      </p>
      {retryable && (
        <button type="button" className="agent-button" disabled={busy} onClick={() => void retry()}>
          {busy ? 'Trying again…' : 'Try again'}
        </button>
      )}
    </div>
  );
}
