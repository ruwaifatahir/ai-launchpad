import { describe, expect, it } from 'vitest';
import { amountInput } from './amount-input';

describe('amountInput', () => {
  it('keeps digits and one decimal point', () => {
    expect(amountInput('12.5')).toBe('12.5');
    expect(amountInput('1.2.3')).toBe('1.23');
    expect(amountInput('.5')).toBe('.5');
  });

  it('reads a comma as the decimal point', () => {
    expect(amountInput('1,5')).toBe('1.5');
  });

  it('drops anything that is not part of a number', () => {
    expect(amountInput('abc')).toBe('');
    expect(amountInput('-1e3 ETH')).toBe('13');
  });
});
