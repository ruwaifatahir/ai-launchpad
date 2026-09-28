import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { describeAgentError } from '@/entities/agent';
import { ApiError } from '@/shared/api';
import { useSingleFlight } from '@/shared/lib';
import { allowanceKey, allowanceQuery, writePreview, type Allowance } from '../api/previews';

/** One entry in this visit's list. `revision` counts the saves before it, so the list can mark where the Persona changed. */
export type PreviewEntry = {
  id: number;
  writtenAt: number;
  revision: number;
} & ({ kind: 'post'; text: string } | { kind: 'refused' } | { kind: 'unpublishable' });

export type Previews = {
  /** Newest first. Kept for this visit only: the backend stores no Preview. */
  entries: PreviewEntry[];
  /** `undefined` until read, or when the read failed. */
  allowance: Allowance | undefined;
  allowanceFailed: boolean;
  retryAllowance: () => void;
  writing: boolean;
  /** Why the last write failed, in words for the Creator. */
  failure: string | null;
  write: () => void;
};

/** This visit's Previews and the Allowance left today. `revision` is how many times the Persona was saved this visit. */
export function usePreviews(token: string, wallet: string, revision: number): Previews {
  const queryClient = useQueryClient();
  const singleFlight = useSingleFlight();
  const allowance = useQuery(allowanceQuery(token, wallet));
  const [entries, setEntries] = useState<PreviewEntry[]>([]);
  const [writing, setWriting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const nextId = useRef(1);

  const write = () =>
    void singleFlight(async () => {
      setWriting(true);
      setFailure(null);
      try {
        const reply = await writePreview(token);
        // Every reply carries the Allowance, so it is never read again after the first paint.
        const { allowance: total, remaining, resetsAt } = reply;
        queryClient.setQueryData<Allowance>(allowanceKey(token, wallet), { allowance: total, remaining, resetsAt });
        const base = { id: nextId.current++, writtenAt: Date.now(), revision };
        // A refusal and an unpublishable pair are facts about the Persona: shown, not thrown.
        const entry: PreviewEntry =
          reply.text !== null && reply.reason === null
            ? { ...base, kind: 'post', text: reply.text }
            : { ...base, kind: reply.reason === 'refused' ? 'refused' : 'unpublishable' };
        setEntries((current) => [entry, ...current]);
      } catch (error) {
        // A 401 has already ended the Session, and the page asks for a sign in on its own.
        if (error instanceof ApiError && error.status === 401) return;
        if (error instanceof ApiError && error.code === 'PREVIEW_ALLOWANCE_SPENT') {
          // Spent elsewhere, in another tab: the count here is behind, so read it again.
          void queryClient.invalidateQueries({ queryKey: allowanceKey(token, wallet) });
        }
        setFailure(describeAgentError(error).message);
      } finally {
        setWriting(false);
      }
    });

  return {
    entries,
    allowance: allowance.data,
    allowanceFailed: allowance.isError,
    retryAllowance: () => void allowance.refetch(),
    writing,
    failure,
    write,
  };
}

const timeOnly = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayAndTime = new Intl.DateTimeFormat(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' });

/**
 * When the Allowance comes back, in the Creator's own zone: it resets at midnight UTC, which is
 * another hour, and sometimes another day, where they are.
 */
export function formatReset(resetsAt: string, nowMs: number): string {
  const reset = new Date(resetsAt);
  const now = new Date(nowMs);
  const tomorrow = new Date(nowMs);
  tomorrow.setDate(now.getDate() + 1);
  if (reset.toDateString() === now.toDateString()) return `at ${timeOnly.format(reset)}`;
  if (reset.toDateString() === tomorrow.toDateString()) return `tomorrow at ${timeOnly.format(reset)}`;
  return `on ${dayAndTime.format(reset)}`;
}
