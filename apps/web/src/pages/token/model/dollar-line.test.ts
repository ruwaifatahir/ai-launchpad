import { describe, expect, it } from 'vitest';
import { dollarLine } from './dollar-line';

// One NVDA at $225.66018707; one token at 0.0000000798 NVDA.
const RATE = 225.66018707;
const PRICE = 7.98e-8;

describe('dollarLine', () => {
  it('values a Paired asset amount at the Dollar rate', () => {
    expect(dollarLine(2.5, { pairPerUnit: 1, rate: RATE })).toBe('$564.15');
  });

  it('values a token amount at its chain price times the Dollar rate', () => {
    expect(dollarLine(1_000_000, { pairPerUnit: PRICE, rate: RATE })).toBe('$18.01');
  });

  it('shows a dash with nothing typed, or zero, or the chain price unread', () => {
    expect(dollarLine(0, { pairPerUnit: 1, rate: RATE })).toBe('–');
    expect(dollarLine(Number.NaN, { pairPerUnit: 1, rate: RATE })).toBe('–');
    expect(dollarLine(2.5, { pairPerUnit: null, rate: RATE })).toBe('–');
  });

  it('shows no line at all without a Dollar rate', () => {
    expect(dollarLine(2.5, { pairPerUnit: 1, rate: null })).toBeNull();
  });
});
