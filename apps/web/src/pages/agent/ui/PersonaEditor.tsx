import { useId, useState, type CSSProperties, type FormEvent } from 'react';
import { describeAgentError, PERSONA_PARTS, type Agent, type PersonaPart } from '@/entities/agent';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { useEditAgent } from '../api/edit-agent';
import { PERSONA_LIMITS } from '../config/persona-limits';
import type { PersonaEdit, PersonaForm } from '../model/persona-edit';
import { PaceField } from './PaceField';
import { TopicsField } from './TopicsField';

/** Each Persona part's label, what it is for, and how tall its box starts. */
const PARTS: Record<PersonaPart, { label: string; hint: string; rows: number }> = {
  name: { label: 'Name', hint: 'What your agent calls itself.', rows: 1 },
  personality: { label: 'Personality', hint: 'How it thinks, and how it comes across.', rows: 4 },
  lore: { label: 'Lore', hint: 'Its backstory: where it came from and what it has seen.', rows: 6 },
  style: { label: 'Style', hint: 'How it writes: length, tone, punctuation.', rows: 3 },
};

const count = new Intl.NumberFormat('en-US');

type PersonaEditorProps = {
  token: string;
  wallet: string;
  agent: Agent;
  form: PersonaForm;
  edit: PersonaEdit;
  onChange: (form: PersonaForm) => void;
  /** The Agent as saved, once the backend took the edit. */
  onSaved: (agent: Agent) => void;
};

/** Name, personality, lore, style, Topics and Pace, saved together with one button. Editable in every state. */
export function PersonaEditor({ token, wallet, agent, form, edit, onChange, onSaved }: PersonaEditorProps) {
  const save = useEditAgent(token, wallet);
  // Clearing a part of an Agent that could post asks first, in place of the Save button.
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const hasErrors = Object.keys(edit.errors).length > 0;
  const canSave = edit.body !== null && !hasErrors && !save.isPending;

  const set = <K extends keyof PersonaForm>(field: K, value: PersonaForm[K]) => {
    setConfirming(false);
    onChange({ ...form, [field]: value });
  };

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSave || edit.body === null) return;
    if (edit.clearsLivePart && !confirming) {
      setConfirming(true);
      return;
    }
    const body = edit.body;
    setConfirming(false);
    setFailure(null);
    save.mutate(body, {
      onSuccess: () => {
        onSaved({ ...agent, ...body });
        toast.success({ title: 'Changes saved', description: 'They apply to your agent’s next post.' });
      },
      onError: (error) => {
        // A 401 has already ended the Session, and the page asks for a sign in on its own.
        if (error instanceof ApiError && error.status === 401) return;
        setFailure(describeAgentError(error).message);
      },
    });
  }

  const cleared = PERSONA_PARTS.filter((part) => edit.body?.[part] === null).map((part) =>
    PARTS[part].label.toLowerCase(),
  );

  return (
    <form className="agent-panel agent-persona" onSubmit={submit} noValidate aria-labelledby="agent-persona-title">
      <header className="agent-panel-head">
        <h2 id="agent-persona-title">Persona</h2>
        <p>Who your agent is. It needs all four parts before it can post.</p>
      </header>

      <div className="agent-fields">
        {PERSONA_PARTS.map((part) => (
          <PartField
            key={part}
            part={part}
            value={form[part]}
            error={edit.errors[part]}
            onChange={(value) => set(part, value)}
          />
        ))}
        <TopicsField topics={form.topics} error={edit.errors.topics} onChange={(topics) => set('topics', topics)} />
        <PaceField pace={form.pace} error={edit.errors.pace} onChange={(pace) => set('pace', pace)} />
      </div>

      <footer className="agent-persona-foot">
        {confirming ? (
          <div className="agent-confirm" role="alertdialog" aria-labelledby="agent-confirm-copy">
            <p id="agent-confirm-copy">
              Clearing the {listOf(cleared)} stops your agent posting until the persona is complete again.
            </p>
            <div className="agent-confirm-actions">
              <Button type="submit" className="agent-save" busy={save.isPending}>
                Clear and save
              </Button>
              <button type="button" className="agent-button" onClick={() => setConfirming(false)}>
                Keep editing
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="agent-save-state" aria-live="polite">
              {saveState(edit, hasErrors, save.isPending)}
            </p>
            <Button type="submit" className="agent-save" disabled={!canSave} busy={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        )}
        {failure && (
          <p className="agent-failure" role="alert">
            Couldn’t save: {failure}.
          </p>
        )}
      </footer>
    </form>
  );
}

function saveState(edit: PersonaEdit, hasErrors: boolean, saving: boolean): string {
  if (saving) return 'Saving your changes';
  if (hasErrors) return 'Fix the marked fields to save';
  return edit.body === null ? 'No unsaved changes' : 'Unsaved changes';
}

/** "name", "name and lore", "name, lore and style". */
function listOf(items: string[]): string {
  if (items.length < 2) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function PartField({
  part,
  value,
  error,
  onChange,
}: {
  part: PersonaPart;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const { label, hint, rows } = PARTS[part];
  const limit = PERSONA_LIMITS[part];
  const used = value.trim().length;
  const describedBy = `${id}-hint ${id}-count${error ? ` ${id}-error` : ''}`;
  const common = {
    id,
    value,
    name: part,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  } as const;

  return (
    <div className="agent-field">
      <div className="agent-field-top">
        <label htmlFor={id}>{label}</label>
        <span id={`${id}-count`} className="agent-count" data-over={used > limit || undefined}>
          <span className="sr-only">Used </span>
          {count.format(used)} / {count.format(limit)}
          <span className="sr-only"> characters</span>
        </span>
      </div>
      {rows === 1 ? (
        <input {...common} className="agent-input" type="text" autoComplete="off" spellCheck={false} />
      ) : (
        <textarea
          {...common}
          className="agent-input agent-textarea"
          autoComplete="off"
          rows={rows}
          // Grows with the text from here; `rows` alone is ignored where the box sizes to its content.
          style={{ '--rows': rows } as CSSProperties}
        />
      )}
      <p id={`${id}-hint`} className="agent-field-hint">
        {hint}
      </p>
      {error && (
        <p id={`${id}-error`} className="agent-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
