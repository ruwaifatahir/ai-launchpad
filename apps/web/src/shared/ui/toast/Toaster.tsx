import { cx } from '@/shared/lib';
import { AlertIcon, CheckIcon, CloseIcon } from '@/shared/ui/icon';
import { dismissToast, useToasts } from './toast';
import './toast.css';

/** Where toasts appear: top right, under the nav. Mount once, in the app layout. */
export function Toaster() {
  const toasts = useToasts();

  return (
    <section className="toast-viewport toast-viewport--top-right" aria-label="Notifications">
      {/* The list is always mounted, so screen readers are already watching it when a toast lands. */}
      <ol className="toast-list" aria-live="polite">
        {toasts.map((item) => (
          <li key={item.id} className={cx('toast-item', `is-${item.tone}`)}>
            <span className="toast-icon" aria-hidden="true">
              {item.tone === 'error' ? <AlertIcon /> : <CheckIcon />}
            </span>
            <div>
              <p className="toast-title">{item.title}</p>
              {item.description && <p className="toast-description">{item.description}</p>}
              {item.action && (
                <a className="toast-action" href={item.action.href} target="_blank" rel="noreferrer">
                  {item.action.label}
                </a>
              )}
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Close notification"
              onClick={() => dismissToast(item.id)}
            >
              <CloseIcon size={12} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
