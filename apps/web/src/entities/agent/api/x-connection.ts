import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/shared/api';
import type { ConsentText, XConnection } from '../model/x-connection';
import { saveXReturn } from '../lib/x-return';
import { retryAgentCall } from './agent';

/** Like the Agent's keys: lowercase token, and the wallet asking, so a wallet switch never shows another's answer. */
export const xConnectionKeys = {
  all: ['x-connection'] as const,
  detail: (token: string, wallet: string) =>
    [...xConnectionKeys.all, token.toLowerCase(), wallet.toLowerCase()] as const,
  consent: (token: string, wallet: string) => [...xConnectionKeys.detail(token, wallet), 'consent'] as const,
};

const connectionPath = (token: string) => `/api/v1/core/connections/${token.toLowerCase()}`;

/**
 * The X connection of `token`. Only `enabled` once the Agent is Unlocked: before that every
 * connection route is a 409.
 */
export function useXConnection(token: string, wallet: string, enabled: boolean) {
  return useQuery({
    queryKey: xConnectionKeys.detail(token, wallet),
    queryFn: () => apiRequest<XConnection>(connectionPath(token)),
    retry: retryAgentCall,
    enabled,
  });
}

/** The Consent wording to show. Read fresh each time the step opens, so the version sent back is the latest. */
export function useConsentText(token: string, wallet: string) {
  return useQuery({
    queryKey: xConnectionKeys.consent(token, wallet),
    queryFn: () => apiRequest<ConsentText>(`${connectionPath(token)}/consent`),
    retry: retryAgentCall,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * A step the backend decides the outcome of: no optimistic change, and the X connection is read
 * again after it, since no step's reply names the next one. Consent is re-read too, so a stale
 * version shows the new wording.
 */
function useConnectionStep<Input, Reply>(token: string, wallet: string, call: (input: Input) => Promise<Reply>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSettled: () => queryClient.invalidateQueries({ queryKey: xConnectionKeys.detail(token, wallet) }),
  });
}

/** Records Consent to the `version` the latest read showed. */
export function useAgreeConsent(token: string, wallet: string) {
  return useConnectionStep(token, wallet, (version: number) =>
    apiRequest(`${connectionPath(token)}/consent`, { method: 'POST', body: { version } }),
  );
}

/**
 * Starts Authorization and leaves for X's own screen. The URL is used once and never kept; the
 * token is saved first, since an expired return comes back without it. A refusal, such as Consent
 * gone out of date, re-reads the X connection so the panel shows the step that is really left.
 */
export function useAuthorizeX(token: string, wallet: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<{ url: string }>(`${connectionPath(token)}/authorization`, { method: 'POST' }),
    onSuccess: ({ url }) => {
      saveXReturn(token);
      window.location.assign(url);
    },
    onError: () => queryClient.invalidateQueries({ queryKey: xConnectionKeys.detail(token, wallet) }),
  });
}

/** Records the Creator's Attestation. The body stays empty: the backend refuses any field. */
export function useAttestX(token: string, wallet: string) {
  return useConnectionStep(token, wallet, () => apiRequest(`${connectionPath(token)}/attestation`, { method: 'PUT' }));
}

/** Takes the Agent off its X account. Its posts stay on X, and its Persona is untouched. */
export function useDisconnectX(token: string, wallet: string) {
  return useConnectionStep(token, wallet, () => apiRequest(connectionPath(token), { method: 'DELETE' }));
}
