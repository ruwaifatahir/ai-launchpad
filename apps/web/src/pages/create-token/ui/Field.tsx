import type { ReactNode } from 'react';
import { cx } from '@/shared/lib';

/*
 * Form field shells. Two explicit variants instead of an `as` switch:
 *  - LabelField wraps a single control in a <label>, so the caption names it.
 *  - GroupField is a plain container for composite controls that label themselves.
 */

type FieldProps = {
  label: ReactNode;
  /** Span both columns of the form grid. */
  span?: 'half' | 'full';
  /** Shown under the control; the control itself sets `aria-invalid`. */
  error?: string | undefined;
  children: ReactNode;
};

const fieldClass = (span: FieldProps['span']) => cx('launchpad-field', span === 'full' && 'launchpad-field-wide');

export function LabelField({ label, span = 'half', error, children }: FieldProps) {
  return (
    <label className={fieldClass(span)}>
      <span className="launchpad-label">{label}</span>
      {children}
      <FieldError message={error} />
    </label>
  );
}

export function GroupField({ label, span = 'half', error, children }: FieldProps) {
  return (
    <div className={fieldClass(span)}>
      <span className="launchpad-label">{label}</span>
      {children}
      <FieldError message={error} />
    </div>
  );
}

export function FieldNote({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} className="launchpad-field-note">
      {children}
    </span>
  );
}

export function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <span className="launchpad-field-note launchpad-field-error" role="alert">
      {message}
    </span>
  );
}
