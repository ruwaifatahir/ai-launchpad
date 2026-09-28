import { queryOptions } from '@tanstack/react-query';
import { retryAgentCall } from '@/entities/agent';
import { apiRequest } from '@/shared/api';

/** How many Previews the Agent has left in this UTC day. */
export type Allowance = {
  allowance: number;
  remaining: number;
  /** ISO 8601: the next midnight UTC. */
  resetsAt: string;
};

/** One Preview: the post, or why the writer gave none. Never both. */
export type PreviewReply = Allowance & {
  text: string | null;
  reason: 'refused' | 'unpublishable' | null;
};

const previewPath = (token: string) => `/api/v1/core/previews/${token.toLowerCase()}`;

export const allowanceKey = (token: string, wallet: string) =>
  ['preview-allowance', token.toLowerCase(), wallet.toLowerCase()] as const;

/** Read once when the page opens; after that each Preview reply carries the Allowance. */
export function allowanceQuery(token: string, wallet: string) {
  return queryOptions({
    queryKey: allowanceKey(token, wallet),
    queryFn: () => apiRequest<Allowance>(`${previewPath(token)}/allowance`),
    retry: retryAgentCall,
    staleTime: Infinity,
  });
}

/** Writes one Preview from the saved Persona. Nothing is stored or published. */
export function writePreview(token: string): Promise<PreviewReply> {
  return apiRequest<PreviewReply>(previewPath(token), { method: 'POST' });
}
