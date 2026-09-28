import { describe, expect, it } from 'vitest';
import { activeResultIndex, moveActive } from './search-combobox';
import type { SearchResult } from './token-search';

const result = (address: string): SearchResult => ({
  address,
  image: null,
  name: 'Pons',
  ticker: '$PONS',
  graduated: false,
  figure: { value: '4.5K NVDA', label: 'MC', description: 'market cap' },
  time: { text: '3h ago', datetime: '2026-09-21T00:00:00.000Z' },
});

describe('activeResultIndex', () => {
  const results = [result('0x01'), result('0x02'), result('0x03')];

  it('follows the highlighted token wherever a poll moved it', () => {
    expect(activeResultIndex(results, '0x03')).toBe(2);
  });

  it('starts at the first result, and returns there once the highlighted token is gone', () => {
    expect(activeResultIndex(results, null)).toBe(0);
    expect(activeResultIndex(results, '0x09')).toBe(0);
    expect(activeResultIndex([], '0x01')).toBe(0);
  });
});

describe('moveActive', () => {
  it('moves down and up through the results', () => {
    expect(moveActive(0, 5, 'down')).toBe(1);
    expect(moveActive(3, 5, 'up')).toBe(2);
  });

  it('wraps past either end', () => {
    expect(moveActive(4, 5, 'down')).toBe(0);
    expect(moveActive(0, 5, 'up')).toBe(4);
  });

  it('stays put with no results', () => {
    expect(moveActive(0, 0, 'down')).toBe(0);
  });
});
