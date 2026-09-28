import type { Address } from 'viem';
import type { Credential } from '@/shared/auth';
import { apiRequest } from './client';

/** A single-use nonce for the message a wallet signs. Lives five minutes. */
export async function fetchNonce(): Promise<string> {
  const { nonce } = await apiRequest<{ nonce: string }>('/api/v1/auth/sessions/nonce', { credential: null });
  return nonce;
}

/** Trades a signed EIP-4361 message for a Credential token. */
export async function createSession(message: string, signature: string): Promise<string> {
  const { token } = await apiRequest<{ token: string }>('/api/v1/auth/sessions', {
    method: 'POST',
    body: { message, signature },
    credential: null,
  });
  return token;
}

/** The wallet `credential` names, checksummed. Fails with 401 when the Credential is no good. */
export async function fetchCurrentSession(credential: Credential): Promise<{ wallet: Address }> {
  return apiRequest<{ wallet: Address }>('/api/v1/auth/sessions/current', { credential });
}
