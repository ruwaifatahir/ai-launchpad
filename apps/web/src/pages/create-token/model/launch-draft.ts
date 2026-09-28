import { createContext, use } from 'react';
import type { LaunchDraft } from './launch-plan';

/*
 * Draft of the token being launched. The form edits it and the preview panel reads it,
 * so the state lives in a provider above both (LaunchDraftProvider). Consumers only see
 * { state, actions } and never know how the draft is stored.
 */

export type LaunchDraftActions = {
  set: <K extends keyof LaunchDraft>(field: K, value: LaunchDraft[K]) => void;
};

export type LaunchDraftContextValue = {
  state: LaunchDraft;
  actions: LaunchDraftActions;
};

export const LaunchDraftContext = createContext<LaunchDraftContextValue | null>(null);

export function useLaunchDraft() {
  const context = use(LaunchDraftContext);
  if (!context) throw new Error('useLaunchDraft must be used inside <LaunchDraftProvider>');
  return context;
}
