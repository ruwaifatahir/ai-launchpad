import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import type { ApiListedToken } from '@/entities/token';
import type { ExplorePage, GraduatedPage } from '../api/token-lists';
import { exploreList, graduatedList } from './token-lists';

const NOW_MS = 1_790_000_000_000;

const token = (address: string): ApiListedToken => ({
  token: address,
  name: 'Pons',
  symbol: 'PONS',
  logo: '',
  creator: '0xb9f5a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e624b0',
  marketCap: '1000000000000000000',
  quoteAsset: { address: '0x0ae6ab900fc7f3be5bd9f5137827fa99200373f7', symbol: 'NVDA', decimals: 18 },
  quoteUsd: null,
  progress: 10,
  graduated: false,
  launchedAt: NOW_MS / 1000 - 60,
  lastBuyAt: NOW_MS / 1000 - 10,
});

const graduatedPage = (overrides: Partial<GraduatedPage> = {}): GraduatedPage => ({
  page: 1,
  pageSize: 10,
  total: 23,
  tokens: [token('0x01'), token('0x02')],
  ...overrides,
});

const explorePage = (overrides: Partial<ExplorePage> = {}): ExplorePage => ({
  sort: 'recent-buys',
  age: 'all',
  page: 1,
  pageSize: 50,
  total: 120,
  launched: 4_228,
  tokens: [token('0x01')],
  ...overrides,
});

describe('graduatedList', () => {
  it('counts every graduated token and pages them by the page size asked for', () => {
    const list = graduatedList({ data: graduatedPage(), error: null }, NOW_MS);
    expect(list.count).toBe('23');
    expect(list.pageCount).toBe(3);
    expect(list.grid.status).toBe('ready');
    if (list.grid.status === 'ready') expect(list.grid.tokens.map((t) => t.address)).toEqual(['0x01', '0x02']);
  });

  it('is loading before its first answer, with no count', () => {
    expect(graduatedList({ data: undefined, error: null }, NOW_MS)).toEqual({
      count: null,
      pageCount: null,
      grid: { status: 'loading' },
    });
  });

  it('says the indexer is unavailable when the route fails before any answer', () => {
    expect(graduatedList({ data: undefined, error: new ApiError(503, 'down') }, NOW_MS).grid).toEqual({
      status: 'unavailable',
    });
  });

  it('says the indexer is unavailable when a later poll fails, rather than keep cards it cannot vouch for', () => {
    expect(graduatedList({ data: graduatedPage(), error: new ApiError(503, 'down') }, NOW_MS).grid.status).toBe(
      'unavailable',
    );
  });

  it('says so when nothing has graduated', () => {
    const list = graduatedList({ data: graduatedPage({ total: 0, tokens: [] }), error: null }, NOW_MS);
    expect(list).toEqual({
      count: '0',
      pageCount: 1,
      grid: { status: 'empty', message: 'No token has graduated yet.' },
    });
  });
});

describe('exploreList', () => {
  it('counts every token ever launched, and pages the tokens the sort and age keep', () => {
    const list = exploreList({ data: explorePage(), error: null }, NOW_MS);
    expect(list.count).toBe('4,228');
    expect(list.pageCount).toBe(3);
    expect(list.grid.status).toBe('ready');
  });

  it('pages by the page size the answer was read for', () => {
    expect(exploreList({ data: explorePage({ total: 20, pageSize: 20 }), error: null }, NOW_MS).pageCount).toBe(1);
    expect(exploreList({ data: explorePage({ total: 21, pageSize: 20 }), error: null }, NOW_MS).pageCount).toBe(2);
  });

  it('shows a page past the end of a shrinking list as empty, with the pages that remain', () => {
    const list = exploreList({ data: explorePage({ page: 4, total: 120, tokens: [] }), error: null }, NOW_MS);
    expect(list.pageCount).toBe(3);
    expect(list.grid.status).toBe('empty');
  });

  it('shows each card by the sort the answer was read for', () => {
    const volume = exploreList(
      {
        data: explorePage({ sort: 'volume', tokens: [{ ...token('0x01'), volume: '2000000000000000000' }] }),
        error: null,
      },
      NOW_MS,
    );
    if (volume.grid.status !== 'ready') throw new Error('not ready');
    expect(volume.grid.tokens[0]!.figure.label).toBe('Vol');
    expect(volume.grid.tokens[0]!.time.recentBuy).toBe(false);

    const recent = exploreList({ data: explorePage(), error: null }, NOW_MS);
    if (recent.grid.status !== 'ready') throw new Error('not ready');
    expect(recent.grid.tokens[0]!.time.recentBuy).toBe(true);
  });

  it.each([
    ['recent-buys', 'all', 'No token has been bought yet.'],
    ['recent-buys', '24h', 'No token was bought in the last 24 hours.'],
    ['recent-buys', '7d', 'No token was bought in the last 7 days.'],
    ['volume', 'all', 'No token has traded yet.'],
    ['volume', '24h', 'No token traded in the last 24 hours.'],
    ['volume', '7d', 'No token traded in the last 7 days.'],
    ['newest', 'all', 'No token is on its bonding curve.'],
    ['oldest', '24h', 'No token on its bonding curve launched in the last 24 hours.'],
    ['market-cap', '7d', 'No token on its bonding curve launched in the last 7 days.'],
  ] as const)('under %s and %s, an empty list says %s', (sort, age, message) => {
    const list = exploreList({ data: explorePage({ sort, age, total: 0, tokens: [] }), error: null }, NOW_MS);
    expect(list.grid).toEqual({ status: 'empty', message });
  });

  it('says the indexer is unavailable when the route fails before any answer', () => {
    expect(exploreList({ data: undefined, error: new ApiError(503, 'down') }, NOW_MS)).toEqual({
      count: null,
      pageCount: null,
      grid: { status: 'unavailable' },
    });
  });
});
