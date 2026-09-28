import { ApiError } from '@/shared/api';

/** Why a call to the agent, preview or X connection routes failed, in words for the Creator, and whether trying again can help. */
export type AgentErrorCopy = { message: string; retryable: boolean };

/** What a 503 could not reach, by its `code`. All are worth a retry. */
const unavailable: Record<string, string> = {
  CHAIN_UNAVAILABLE: 'The chain couldn’t be read. Try again shortly',
  INDEXER_UNAVAILABLE: 'The indexer couldn’t be read. Try again shortly',
  INDEXER_BUSY: 'The indexer is busy. Try again in a second',
  WRITER_UNAVAILABLE: 'The writer couldn’t be reached. Nothing was spent, so try again',
};

/** The rules a 409 can name, by its `code`. The page gates on each, so seeing one means the page was out of date. */
const conflicts: Record<string, string> = {
  AGENT_STOPPED: 'AI Launchpad stopped this agent, so it can’t be resumed',
  TOKEN_NOT_GRADUATED: 'The Pool hasn’t opened yet, so the agent writes nothing',
  PERSONA_INCOMPLETE: 'Finish the persona first: it needs a name, personality, lore and style',
  CONSENT_REQUIRED: 'Agree to the X terms first',
  CONSENT_OUTDATED: 'The X terms changed. Agree to them again',
  CONSENT_VERSION_MISMATCH: 'The X terms changed while you read them. Read them again',
  CONNECTION_REQUIRED: 'Connect an X account first',
};

function tooManyRequests(retryAfterSeconds: number | undefined): string {
  if (retryAfterSeconds === undefined) return 'Too many requests. Try again in a minute';
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many requests. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/**
 * Every refusal the agent and preview routes can give has its own line: 403 and 404 by status,
 * the rest by the `code` the backend sends to branch on.
 */
export function describeAgentError(error: unknown): AgentErrorCopy {
  if (!(error instanceof ApiError)) {
    return { message: 'AI Launchpad couldn’t be reached. Check your connection and try again', retryable: true };
  }
  switch (error.status) {
    case 400:
      return { message: 'AI Launchpad refused this change. Check each field and try again', retryable: false };
    case 403:
      return { message: 'Only the wallet that launched this token can manage its agent', retryable: false };
    case 404:
      if (error.code === 'CONNECTION_NOT_FOUND') {
        return { message: 'No X account is connected to this agent', retryable: false };
      }
      // The launch record already found the token; the backend's launchpad is catching up.
      return { message: 'AI Launchpad hasn’t picked up this token yet. Try again in a minute', retryable: true };
    case 409:
      return { message: conflicts[error.code ?? ''] ?? 'The agent changed meanwhile. Try again', retryable: false };
    case 429:
      // Both 429s send the same headers; only the code tells the Allowance from the rate limit.
      return error.code === 'PREVIEW_ALLOWANCE_SPENT'
        ? { message: 'No previews left today', retryable: false }
        : { message: tooManyRequests(error.retryAfterSeconds), retryable: true };
    case 503:
      return {
        message: unavailable[error.code ?? ''] ?? 'AI Launchpad couldn’t be reached. Try again shortly',
        retryable: true,
      };
    default:
      return { message: 'Something went wrong on AI Launchpad’s side', retryable: false };
  }
}
