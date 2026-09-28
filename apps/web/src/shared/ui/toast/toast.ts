import { useSyncExternalStore } from 'react';

export type Toast = {
  id: number;
  tone: 'success' | 'error';
  title: string;
  description?: string | undefined;
  /** A link out, such as the transaction on the explorer. */
  action?: { label: string; href: string } | undefined;
};

type ToastInput = Omit<Toast, 'id' | 'tone'>;

/** Successes clear themselves; errors stay until closed, so there is time to read them. */
const SUCCESS_MS = 6000;
/** Older toasts drop off past this many. */
const MAX_TOASTS = 3;

let toasts: readonly Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: readonly Toast[]) {
  toasts = next;
  for (const listener of listeners) listener();
}

export function dismissToast(id: number) {
  publish(toasts.filter((t) => t.id !== id));
}

function show(tone: Toast['tone'], input: ToastInput) {
  const id = nextId++;
  publish([...toasts, { ...input, id, tone }].slice(-MAX_TOASTS));
  if (tone === 'success') setTimeout(() => dismissToast(id), SUCCESS_MS);
}

/** Tell the user how an action they started ended, from anywhere; the app's `Toaster` shows it. */
export const toast = {
  success: (input: ToastInput) => show('success', input),
  error: (input: ToastInput) => show('error', input),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribe, () => toasts);
}
