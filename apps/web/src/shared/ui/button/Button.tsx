import type { ComponentProps } from 'react';
import { cx } from '@/shared/lib';
import './button.css';

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary';
  /** Waiting on something the click started: shows a spinner and a load bar, and blocks clicks. */
  busy?: boolean;
};

/** Full-width call-to-action button from the design system. */
export function Button({
  variant = 'primary',
  type = 'button',
  busy = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx('ui-btn', `ui-btn-${variant}`, busy && 'is-busy', className)}
    >
      <span className="ui-btn-label">
        {busy && <span className="ui-btn-spinner" aria-hidden="true" />}
        {children}
      </span>
      {busy && <span className="ui-btn-loadbar" aria-hidden="true" />}
    </button>
  );
}
