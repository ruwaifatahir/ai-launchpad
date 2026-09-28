import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/shared/api';
import { toast } from '@/shared/ui/toast';
import type { Agent } from '../model/agent';
import { describeAgentError } from '../model/agent-error';

/** How often a Locked Agent is re-read, so the page notices the Pool opening. Well under the rate limit. */
export const LOCKED_POLL_MS = 30_000;

/**
 * The path takes any letter case, so the key is lowercase. It also names the wallet asking, so a
 * wallet switch never shows another wallet's answer.
 */
export const agentKeys = {
  all: ['agent'] as const,
  detail: (token: string, wallet: string) => [...agentKeys.all, token.toLowerCase(), wallet.toLowerCase()] as const,
};

export const agentPath = (token: string) => `/api/v1/core/agents/${token.toLowerCase()}`;

/** Retries only what is worth it: the network, and a 503 naming the chain or the indexer. */
export function retryAgentCall(failures: number, error: Error): boolean {
  if (error instanceof ApiError && error.status !== 503) return false;
  return failures < 2;
}

/** A token's Agent, read with the stored Credential. Polled while Locked, and not after. */
export function agentQuery(token: string, wallet: string) {
  return queryOptions({
    queryKey: agentKeys.detail(token, wallet),
    queryFn: () => apiRequest<Agent>(agentPath(token)),
    retry: retryAgentCall,
    refetchInterval: (query) => (query.state.data?.graduatedAt === null ? LOCKED_POLL_MS : false),
  });
}

/**
 * The Agent of `token`, for the Connected `wallet`. Only `enabled` once the caller knows the wallet
 * has a Session and launched the token; the API's 403 stays the final word.
 */
export function useAgent(token: string, wallet: string | undefined, enabled: boolean) {
  return useQuery({ ...agentQuery(token, wallet ?? ''), enabled: enabled && wallet !== undefined });
}

/**
 * Folds a write's reply into the cached Agent. Each write answers with a subset, so replacing the
 * cache would drop `graduatedAt` and `stoppedAt`.
 */
export function mergeIntoAgent(queryClient: QueryClient, key: readonly unknown[], reply: Partial<Agent>) {
  queryClient.setQueryData<Agent>(key, (agent) => {
    if (!agent) return agent;
    const merged = { ...agent };
    for (const field of Object.keys(agent) as (keyof Agent)[]) {
      if (field in reply) Object.assign(merged, { [field]: reply[field] });
    }
    return merged;
  });
}

type PauseReply = { token: string; pausedAt: string | null; updatedAt: string };

/**
 * Pauses or Resumes the Agent. Optimistic: the status changes at once, and goes back with a
 * message if the backend refuses (a 409 on resuming a Stopped Agent).
 */
export function usePauseAgent(token: string, wallet: string) {
  const queryClient = useQueryClient();
  const key = agentKeys.detail(token, wallet);

  return useMutation({
    mutationFn: (paused: boolean) =>
      apiRequest<PauseReply>(`${agentPath(token)}/pause`, { method: 'PUT', body: { paused } }),
    onMutate: async (paused) => {
      // A poll landing now would put the old state back.
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<Agent>(key);
      // Pausing an already Paused Agent keeps its first time, as the backend does.
      mergeIntoAgent(queryClient, key, {
        pausedAt: paused ? (before?.pausedAt ?? new Date().toISOString()) : null,
      });
      return { before };
    },
    onError: (error, paused, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
      // A 401 has already ended the Session, and the page asks for a sign in on its own.
      if (error instanceof ApiError && error.status === 401) return;
      toast.error({
        title: paused ? 'Couldn’t pause the agent' : 'Couldn’t resume the agent',
        description: describeAgentError(error).message,
      });
    },
    onSuccess: (reply) => mergeIntoAgent(queryClient, key, { pausedAt: reply.pausedAt }),
  });
}
