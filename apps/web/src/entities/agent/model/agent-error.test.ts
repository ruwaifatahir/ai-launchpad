import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { describeAgentError } from './agent-error';

const unavailable = (code: string) => describeAgentError(new ApiError(503, 'Unavailable', code));
const conflict = (code: string) => describeAgentError(new ApiError(409, 'Conflict', code)).message;

describe('describeAgentError', () => {
  it('names a wallet that did not launch the token, and a token AI Launchpad does not know, by status', () => {
    expect(describeAgentError(new ApiError(403, 'Forbidden', 'NOT_TOKEN_CREATOR'))).toEqual({
      message: 'Only the wallet that launched this token can manage its agent',
      retryable: false,
    });
    expect(describeAgentError(new ApiError(404, 'Not found', 'TOKEN_NOT_FOUND'))).toEqual({
      message: 'AI Launchpad hasn’t picked up this token yet. Try again in a minute',
      retryable: true,
    });
  });

  it('names what could not be read on a 503, and offers to try again', () => {
    expect(unavailable('CHAIN_UNAVAILABLE')).toEqual({
      message: 'The chain couldn’t be read. Try again shortly',
      retryable: true,
    });
    expect(unavailable('INDEXER_UNAVAILABLE')).toEqual({
      message: 'The indexer couldn’t be read. Try again shortly',
      retryable: true,
    });
    expect(unavailable('INDEXER_BUSY')).toEqual({
      message: 'The indexer is busy. Try again in a second',
      retryable: true,
    });
    expect(unavailable('WRITER_UNAVAILABLE')).toEqual({
      message: 'The writer couldn’t be reached. Nothing was spent, so try again',
      retryable: true,
    });
  });

  it('names each 409 by its code: a Stopped Agent, a Locked one, an unfinished Persona', () => {
    expect(conflict('AGENT_STOPPED')).toBe('AI Launchpad stopped this agent, so it can’t be resumed');
    expect(conflict('TOKEN_NOT_GRADUATED')).toBe('The Pool hasn’t opened yet, so the agent writes nothing');
    expect(conflict('PERSONA_INCOMPLETE')).toBe(
      'Finish the persona first: it needs a name, personality, lore and style',
    );
  });

  it('names each X connection 409 by its code, and each is out of date rather than worth a retry', () => {
    expect(conflict('CONSENT_REQUIRED')).toBe('Agree to the X terms first');
    expect(conflict('CONSENT_OUTDATED')).toBe('The X terms changed. Agree to them again');
    expect(conflict('CONSENT_VERSION_MISMATCH')).toBe('The X terms changed while you read them. Read them again');
    expect(conflict('CONNECTION_REQUIRED')).toBe('Connect an X account first');
  });

  it('says no X account is connected when a disconnect finds none', () => {
    expect(describeAgentError(new ApiError(404, 'Not found', 'CONNECTION_NOT_FOUND'))).toEqual({
      message: 'No X account is connected to this agent',
      retryable: false,
    });
  });

  it('tells a spent Allowance from the rate limit, though both are a 429', () => {
    expect(describeAgentError(new ApiError(429, 'Spent', 'PREVIEW_ALLOWANCE_SPENT'))).toEqual({
      message: 'No previews left today',
      retryable: false,
    });
    expect(describeAgentError(new ApiError(429, 'Too many requests', 'TOO_MANY_REQUESTS', 61))).toEqual({
      message: 'Too many requests. Try again in 2 minutes',
      retryable: true,
    });
    expect(describeAgentError(new ApiError(429, 'Too many requests', 'TOO_MANY_REQUESTS', 30)).message).toBe(
      'Too many requests. Try again in 1 minute',
    );
    expect(describeAgentError(new ApiError(429, 'Too many requests', 'TOO_MANY_REQUESTS')).message).toBe(
      'Too many requests. Try again in a minute',
    );
  });

  it('falls back to a plain message for anything else, and when AI Launchpad cannot be reached at all', () => {
    expect(describeAgentError(new ApiError(503, 'Unavailable'))).toEqual({
      message: 'AI Launchpad couldn’t be reached. Try again shortly',
      retryable: true,
    });
    expect(describeAgentError(new ApiError(400, 'Bad', 'VALIDATION_ERROR'))).toEqual({
      message: 'AI Launchpad refused this change. Check each field and try again',
      retryable: false,
    });
    expect(describeAgentError(new ApiError(500, 'Internal'))).toEqual({
      message: 'Something went wrong on AI Launchpad’s side',
      retryable: false,
    });
    expect(describeAgentError(new TypeError('Failed to fetch'))).toEqual({
      message: 'AI Launchpad couldn’t be reached. Check your connection and try again',
      retryable: true,
    });
  });
});
