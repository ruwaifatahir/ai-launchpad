import { createAuthenticationAdapter, type AuthenticationStatus } from '@rainbow-me/rainbowkit';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { isAddressEqual } from 'viem';
import { createSiweMessage, parseSiweMessage } from 'viem/siwe';
import { useAccount } from 'wagmi';
import { ApiError, createSession, fetchCurrentSession, fetchNonce } from '@/shared/api';
import { clearCredential, saveCredential, useCredential } from '@/shared/auth';
import { supportedNetwork } from '@/shared/config';

const currentSessionKey = (token: string) => ['session', 'current', token] as const;

/**
 * Whether the Connected wallet has a Session: `loading` while the API confirms a stored Credential,
 * `authenticated` once it has, `unauthenticated` otherwise (including while disconnected).
 */
export function useSessionStatus(): AuthenticationStatus {
  const { address } = useAccount();
  const credential = useCredential();
  const matches = Boolean(address && credential && isAddressEqual(credential.wallet, address));

  const current = useQuery({
    queryKey: currentSessionKey(credential?.token ?? ''),
    queryFn: () => fetchCurrentSession(credential!),
    enabled: matches,
    // Cheap for the API; re-checking on focus notices a Session that expired in an open tab.
    staleTime: 60_000,
    // A 401 is an answer, not a hiccup: the Credential is already cleared.
    retry: (failures, error) => !(error instanceof ApiError && error.status === 401) && failures < 2,
  });

  if (!matches || !credential) return 'unauthenticated';
  if (current.isPending) return 'loading';
  return current.data && isAddressEqual(current.data.wallet, credential.wallet) ? 'authenticated' : 'unauthenticated';
}

/** RainbowKit's sign in step, backed by the API's Sessions. */
function createSessionAdapter(queryClient: QueryClient) {
  return createAuthenticationAdapter({
    // RainbowKit fetches one nonce per modal and reuses it on retry, but the API spends a nonce on
    // any attempt and expires it after five minutes. So `createMessage` fetches a fresh one each time
    // and this placeholder only unlocks RainbowKit's sign button.
    getNonce: async () => 'fetched-per-attempt',

    // The API only accepts its own chain id, which is the Supported network's.
    createMessage: async ({ address }) =>
      createSiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to AI Launchpad.',
        uri: window.location.origin,
        version: '1',
        chainId: supportedNetwork.id,
        nonce: await fetchNonce(),
        issuedAt: new Date(),
      }),

    verify: async ({ message, signature }) => {
      const { address } = parseSiweMessage(message);
      if (!address) return false;
      const token = await createSession(message, signature);
      // The API just vouched for this token; skip the round trip that would confirm it.
      queryClient.setQueryData(currentSessionKey(token), { wallet: address });
      saveCredential({ wallet: address, token });
      return true;
    },

    signOut: async () => clearCredential(),
  });
}

/** RainbowKit's sign in adapter, bound to the app's query cache. */
export function useSessionAdapter() {
  const queryClient = useQueryClient();
  return useMemo(() => createSessionAdapter(queryClient), [queryClient]);
}
