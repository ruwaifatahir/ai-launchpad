import { describe, expect, it } from 'vitest';
import { readLanding } from './landing';

const TOKEN = '0x1234567890abcdef1234567890abcdef12345678';
const SAVED = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

const read = (query: string, saved: string | null = null) => readLanding(new URLSearchParams(query), saved);

describe('readLanding', () => {
  it('reads a success, and says the Attestation is next', () => {
    expect(read(`status=success&token=${TOKEN}`)).toEqual({
      token: TOKEN,
      outcome: 'success',
      message: { tone: 'success', title: 'X connected', description: 'Finish the X setup to start posting.' },
    });
  });

  it('names each failure by its reason', () => {
    expect(read(`status=failure&reason=declined&token=${TOKEN}`)).toMatchObject({
      outcome: 'declined',
      message: {
        tone: 'error',
        title: 'X wasn’t connected',
        description: 'You cancelled on X. Connect again when you’re ready.',
      },
    });
    expect(read(`status=failure&reason=taken&token=${TOKEN}`)).toMatchObject({
      outcome: 'taken',
      message: { description: 'That X account already serves another token. Connect a different one.' },
    });
    expect(read(`status=failure&reason=expired`, SAVED)).toMatchObject({
      outcome: 'expired',
      message: { description: 'The link to X expired. Start again from your agent.' },
    });
    expect(read(`status=failure&reason=error&token=${TOKEN}`)).toMatchObject({
      outcome: 'error',
      message: { description: 'X didn’t finish connecting. Try again.' },
    });
  });

  it('treats a status or reason it does not know as an error', () => {
    expect(read(`token=${TOKEN}`)).toMatchObject({ outcome: 'error' });
    expect(read(`status=failure&reason=gone&token=${TOKEN}`)).toMatchObject({ outcome: 'error' });
    expect(read(`status=failure&token=${TOKEN}`)).toMatchObject({ outcome: 'error' });
  });

  it('takes the token from the URL over the one saved before leaving for X', () => {
    expect(read(`status=success&token=${TOKEN}`, SAVED).token).toBe(TOKEN);
  });

  it('falls back to the saved token when the URL has none', () => {
    expect(read('status=failure&reason=expired', SAVED).token).toBe(SAVED);
  });

  it('has no token when neither the URL nor the saved one is an address', () => {
    expect(read('status=failure&reason=expired').token).toBeNull();
    expect(read('status=failure&reason=expired&token=nova', 'not-an-address').token).toBeNull();
  });
});
