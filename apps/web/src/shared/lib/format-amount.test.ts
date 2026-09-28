import { describe, expect, it } from 'vitest';
import { formatCompactDollars, formatDollars, formatPairAmount, formatTradeAmount } from './format-amount';

describe('formatPairAmount', () => {
  it('keeps two decimals from 1 up and four significant digits below', () => {
    expect(formatPairAmount(1234.5678)).toBe('1,234.57');
    expect(formatPairAmount(0.000307149)).toBe('0.0003071');
    expect(formatPairAmount(0)).toBe('0');
  });

  it('counts a long run of leading zeros in subscript', () => {
    expect(formatPairAmount(0.0000000186789)).toBe('0.0₇1868');
    expect(formatPairAmount(0.000000000001234)).toBe('0.0₁₁1234');
    expect(formatPairAmount(0.00001234)).toBe('0.0₄1234');
  });
});

describe('formatTradeAmount', () => {
  it('keeps two decimals from 1 up and six decimals below', () => {
    expect(formatTradeAmount(12_077_869.1834)).toBe('12,077,869.18');
    expect(formatTradeAmount(0.198794)).toBe('0.198794');
    expect(formatTradeAmount(0.5)).toBe('0.5');
  });

  it('rounds an amount too small to matter to 0 instead of counting zeros', () => {
    expect(formatTradeAmount(0.0000000798)).toBe('0');
    expect(formatTradeAmount(0)).toBe('0');
  });
});

describe('formatDollars', () => {
  it('writes a dollar amount in full, two decimals from $1 up and four significant digits below', () => {
    expect(formatDollars(65_611_037.7712)).toBe('$65,611,037.77');
    expect(formatDollars(6769.8056)).toBe('$6,769.81');
    expect(formatDollars(0.0690641)).toBe('$0.06906');
    expect(formatDollars(0.0000042)).toBe('$0.0₅42');
    expect(formatDollars(0)).toBe('$0');
  });
});

describe('formatCompactDollars', () => {
  it('writes a dollar amount short, as a card figure', () => {
    expect(formatCompactDollars(673_980_000)).toBe('$673.98M');
    expect(formatCompactDollars(6769.8056)).toBe('$6.77K');
    expect(formatCompactDollars(36.141)).toBe('$36.14');
    expect(formatCompactDollars(0.0690641)).toBe('$0.06906');
  });
});
