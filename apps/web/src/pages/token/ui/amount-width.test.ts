import { describe, expect, it } from 'vitest';
import { amountEms } from './amount-width';

describe('amountEms', () => {
  it('counts a digit as a full strip and a separator as a narrow one', () => {
    expect(amountEms('0')).toBe(0.64);
    expect(amountEms('1.5')).toBe(1.6);
  });

  it('grows with the text, so a long max fill can be scaled to fit', () => {
    expect(amountEms('180.887652831633874284')).toBeGreaterThan(13);
    expect(amountEms('838,896,006.09')).toBeLessThan(amountEms('180.887652831633874284'));
  });
});
