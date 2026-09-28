import { Fragment, useState } from 'react';
import { useNow } from '@/shared/lib';
import { CheckIcon, CopyIcon } from '@/shared/ui/icon';
import { toast } from '@/shared/ui/toast';
import { formatReset, usePreviews, type PreviewEntry, type Previews } from '../model/previews';

/** The ceiling the writer holds every post to. */
const POST_LENGTH = 280;

/** What the writer giving nothing means, and what to do next: the backend's suggested copy. */
const EMPTY_REPLIES = {
  refused: { title: 'Refused', body: 'The writer would not take this persona on. Try editing it.' },
  unpublishable: {
    title: 'Couldn’t keep to the rules',
    body: 'The writer could not stay inside the rules. Ask again.',
  },
} as const;

type PreviewPanelProps = {
  token: string;
  wallet: string;
  /** The saved name, which signs each post as the Agent would. */
  author: string | null;
  revision: number;
  /** Why a Preview cannot be written now, from the Agent's status. */
  blocked: string | null;
};

/** Write a Preview from the saved Persona and read this visit's, newest first, with what is left of today's Allowance. */
export function PreviewPanel({ token, wallet, author, revision, blocked }: PreviewPanelProps) {
  const previews = usePreviews(token, wallet, revision);
  const now = useNow(60_000);
  const { allowance } = previews;
  const spent = allowance !== undefined && allowance.remaining <= 0;
  // The status's reason first; a spent Allowance only matters once a Preview could be written.
  const reason = blocked ?? (spent ? `None left today. More ${formatReset(allowance.resetsAt, now)}` : null);

  return (
    <section className="agent-panel agent-previews" aria-labelledby="agent-previews-title">
      <header className="agent-panel-head">
        <h2 id="agent-previews-title">Previews</h2>
        <p>Your agent writes one post from the saved persona. Nothing is published.</p>
      </header>

      <div className="agent-preview-action">
        <button
          type="button"
          className="agent-button agent-preview-button"
          disabled={reason !== null || previews.writing}
          aria-busy={previews.writing || undefined}
          aria-describedby="agent-preview-reason"
          onClick={previews.write}
        >
          {previews.writing ? 'Writing…' : 'Write a preview'}
        </button>
        <p id="agent-preview-reason" className="agent-preview-note" aria-live="polite">
          {reason ?? allowanceLine(previews)}
        </p>
        {previews.allowanceFailed && allowance === undefined && (
          <button type="button" className="agent-text-button" onClick={previews.retryAllowance}>
            Check again
          </button>
        )}
        {previews.failure && (
          <p className="agent-failure" role="alert">
            {previews.failure}.
          </p>
        )}
      </div>

      {previews.entries.length === 0 ? (
        <p className="agent-previews-empty">
          None yet this visit. Previews aren’t kept, so copy any you want before you leave.
        </p>
      ) : (
        <ol className="agent-preview-list" aria-label="Previews this visit, newest first" aria-live="polite">
          {previews.entries.map((entry, index) => {
            const newer = previews.entries[index - 1];
            // Marks where the Persona was saved between two Previews, so before and after compare.
            const edited = newer !== undefined && newer.revision !== entry.revision;
            return (
              <Fragment key={entry.id}>
                {edited && (
                  <li className="agent-preview-divider" aria-hidden="true">
                    Persona saved
                  </li>
                )}
                <PreviewItem entry={entry} author={author} />
              </Fragment>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function allowanceLine({ allowance, allowanceFailed }: Previews): string {
  if (allowance) return `${allowance.remaining} of ${allowance.allowance} left today`;
  return allowanceFailed ? 'Couldn’t read how many are left today' : 'Checking how many are left today…';
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function PreviewItem({ entry, author }: { entry: PreviewEntry; author: string | null }) {
  const time = new Date(entry.writtenAt);
  const stamp = (
    <time dateTime={time.toISOString()} className="agent-preview-time">
      {timeFormat.format(time)}
    </time>
  );

  if (entry.kind !== 'post') {
    const { title, body } = EMPTY_REPLIES[entry.kind];
    return (
      <li className="agent-preview is-empty">
        <div className="agent-preview-head">
          <span>{title}</span>
          {stamp}
        </div>
        <p className="agent-preview-text">{body}</p>
      </li>
    );
  }

  return (
    <li className="agent-preview">
      <div className="agent-preview-head">
        <span className="agent-preview-author">{author ?? 'Your agent'}</span>
        {stamp}
      </div>
      <p className="agent-preview-text">{entry.text}</p>
      <div className="agent-preview-foot">
        <span className="agent-count">
          {entry.text.length} / {POST_LENGTH}
        </span>
        <CopyPreview text={entry.text} />
      </div>
    </li>
  );
}

function CopyPreview({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error({ title: 'Couldn’t copy the preview', description: 'Select the text and copy it by hand.' });
    }
  }

  return (
    <button type="button" className="agent-text-button" onClick={() => void copy()}>
      {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
