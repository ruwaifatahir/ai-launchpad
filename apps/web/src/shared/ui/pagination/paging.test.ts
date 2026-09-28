import { describe, expect, it } from 'vitest';
import { pageCount, pageToMoveTo } from './paging';

describe('pageCount', () => {
  it('rounds a partial last page up', () => {
    expect(pageCount({ total: 21, pageSize: 20 })).toBe(2);
    expect(pageCount({ total: 20, pageSize: 20 })).toBe(1);
  });

  it('counts an empty list as one page', () => {
    expect(pageCount({ total: 0, pageSize: 20 })).toBe(1);
  });
});

describe('pageToMoveTo', () => {
  it('moves back to the last page once the list shrank past the current one', () => {
    expect(pageToMoveTo(9, 6)).toBe(6);
  });

  it('stays on a page the list still has', () => {
    expect(pageToMoveTo(3, 6)).toBeNull();
    expect(pageToMoveTo(6, 6)).toBeNull();
  });

  it('stays until the list first answers', () => {
    expect(pageToMoveTo(9, null)).toBeNull();
  });
});
