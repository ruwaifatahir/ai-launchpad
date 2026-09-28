import { isAddress, type Address } from 'viem';

/** How the return from X ended, from the query the backend's redirect carries. */
export type LandingOutcome = 'success' | 'declined' | 'expired' | 'taken' | 'error';

export type LandingMessage = { tone: 'success' | 'error'; title: string; description: string };

export type Landing = {
  /** The token the Creator was connecting, or `null` when neither the URL nor this tab kept it. */
  token: Address | null;
  outcome: LandingOutcome;
  message: LandingMessage;
};

const FAILED = 'X wasn’t connected';

const messages: Record<LandingOutcome, LandingMessage> = {
  success: { tone: 'success', title: 'X connected', description: 'Finish the X setup to start posting.' },
  declined: { tone: 'error', title: FAILED, description: 'You cancelled on X. Connect again when you’re ready.' },
  expired: { tone: 'error', title: FAILED, description: 'The link to X expired. Start again from your agent.' },
  taken: {
    tone: 'error',
    title: FAILED,
    description: 'That X account already serves another token. Connect a different one.',
  },
  error: { tone: 'error', title: FAILED, description: 'X didn’t finish connecting. Try again.' },
};

const REASONS = new Set<string>(['declined', 'expired', 'taken', 'error']);

function outcomeOf(query: URLSearchParams): LandingOutcome {
  if (query.get('status') === 'success') return 'success';
  const reason = query.get('reason') ?? '';
  return query.get('status') === 'failure' && REASONS.has(reason) ? (reason as LandingOutcome) : 'error';
}

/**
 * What the return from X says: a hint for the message only, since the X connection read stays the
 * source of truth. The token comes from the URL, or from `saved` when an expired link dropped it.
 */
export function readLanding(query: URLSearchParams, saved: string | null): Landing {
  const outcome = outcomeOf(query);
  const token = [query.get('token'), saved].find((candidate) => candidate && isAddress(candidate));
  return { token: (token as Address | undefined) ?? null, outcome, message: messages[outcome] };
}
