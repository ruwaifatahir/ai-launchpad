import { useEffect, useId, useRef } from 'react';
import { describeAgentError, useAgreeConsent, useConsentText } from '@/entities/agent';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { CloseIcon } from '@/shared/ui/icon';

type ConsentDialogProps = { token: string; wallet: string; onClose: () => void };

/**
 * The Consent wording in a modal dialog: read fresh when it opens, shown as the backend sent it,
 * and agreed to only from here, so nobody agrees without the list in front of them. Mounted only
 * while open; its close event unmounts it.
 */
export function ConsentDialog({ token, wallet, onClose }: ConsentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const text = useConsentText(token, wallet);
  const agree = useAgreeConsent(token, wallet);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // The list, not the close button, so reading starts at the terms and the keyboard scrolls them.
    bodyRef.current?.focus();
  }, []);

  // Every way out closes the dialog natively, so focus returns to the button that opened it.
  const close = () => dialogRef.current?.close();
  const failure = agree.error && !(agree.error instanceof ApiError && agree.error.status === 401) ? agree.error : null;

  return (
    <dialog
      ref={dialogRef}
      className="agent-consent"
      aria-labelledby={titleId}
      aria-busy={text.isPending || undefined}
      onClose={onClose}
      // Escape while agreeing would leave the answer with nowhere to show.
      onCancel={(event) => {
        if (agree.isPending) event.preventDefault();
      }}
    >
      <header className="agent-consent-head">
        <h2 id={titleId}>{text.data?.title ?? 'What your agent will do on your X account'}</h2>
        <button
          type="button"
          className="agent-consent-close"
          aria-label="Close without agreeing"
          disabled={agree.isPending}
          onClick={close}
        >
          <CloseIcon />
        </button>
      </header>

      <div ref={bodyRef} className="agent-consent-body" role="region" tabIndex={-1} aria-label="The terms">
        {text.data ? (
          text.data.sections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              <ul>
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>
          ))
        ) : text.isPending ? (
          <p className="agent-consent-note">Loading the terms…</p>
        ) : (
          <div className="agent-consent-read-failure">
            <p className="agent-failure" role="alert">
              {describeAgentError(text.error).message}.
            </p>
            <button
              type="button"
              className="agent-button"
              disabled={text.isFetching}
              onClick={() => void text.refetch()}
            >
              {text.isFetching ? 'Trying again…' : 'Try again'}
            </button>
          </div>
        )}
      </div>

      <footer className="agent-consent-foot">
        {failure && (
          <p className="agent-failure" role="alert">
            {describeAgentError(failure).message}.
          </p>
        )}
        <div className="agent-consent-actions">
          <button type="button" className="agent-button" disabled={agree.isPending} onClick={close}>
            Cancel
          </button>
          <Button
            className="agent-x-action"
            busy={agree.isPending}
            disabled={!text.data}
            onClick={() => {
              if (text.data) agree.mutate(text.data.version, { onSuccess: close });
            }}
          >
            I agree
          </Button>
        </div>
      </footer>
    </dialog>
  );
}
