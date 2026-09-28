import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import type { ApiListedToken, ApiPairedAsset } from '@/entities/token';
import { searchParams, type SearchPage } from '../api/token-lists';
import { pairOptions, searchView } from './token-search';

const NOW_MS = 1_790_000_000_000;
const NOW = NOW_MS / 1000;
const NVDA = { address: '0x0ae6ab900fc7f3be5bd9f5137827fa99200373f7', symbol: 'NVDA', decimals: 18 };

const token = (address: string, overrides: Partial<ApiListedToken> = {}): ApiListedToken => ({
  token: address,
  name: 'Pons',
  symbol: 'PONS',
  logo: '',
  creator: '0xb9f5a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e624b0',
  marketCap: '4500000000000000000000',
  quoteAsset: NVDA,
  quoteUsd: null,
  progress: 42.5,
  graduated: false,
  launchedAt: NOW - 3 * 3_600,
  lastBuyAt: NOW - 30,
  ...overrides,
});

const searchPage = (overrides: Partial<SearchPage> = {}): SearchPage => ({
  sort: 'relevance',
  age: 'all',
  page: 1,
  pageSize: 24,
  total: 130,
  tokens: [token('0x01'), token('0x02', { graduated: true, progress: 100 })],
  q: '',
  pair: null,
  ...overrides,
});

const ready = (page: SearchPage) => {
  const view = searchView({ data: page, error: null }, NOW_MS);
  if (view.status !== 'ready') throw new Error(`expected results, got ${view.status}`);
  return view;
};

const tokens = (count: number) => Array.from({ length: count }, (_, i) => token(`0x${i}`));

describe('searchParams', () => {
  it('sends the sort, age, page and page size, and leaves out an empty box and every pair', () => {
    const params = searchParams({ q: '', sort: 'relevance', age: 'all', pair: null, page: 1 });
    expect(Object.fromEntries(params)).toEqual({ sort: 'relevance', age: 'all', page: '1', pageSize: '24' });
  });

  it('sends the text and the pair, as quote, when they narrow the search', () => {
    const params = searchParams({ q: 'pon', sort: 'volume', age: '24h', pair: NVDA.address, page: 3 });
    expect(Object.fromEntries(params)).toEqual({
      q: 'pon',
      sort: 'volume',
      age: '24h',
      quote: NVDA.address,
      page: '3',
      pageSize: '24',
    });
  });
});

describe('searchView', () => {
  it('shows each result with its logo, name, ticker, market cap in its Paired asset and age', () => {
    const [result] = ready(searchPage()).results;
    expect(result).toEqual({
      address: '0x01',
      image: null,
      name: 'Pons',
      ticker: '$PONS',
      graduated: false,
      figure: { value: '4.5K NVDA', label: 'MC', description: 'market cap' },
      time: { text: '3h ago', datetime: new Date((NOW - 3 * 3_600) * 1000).toISOString() },
    });
  });

  it('says which results have graduated', () => {
    expect(ready(searchPage()).results.map((result) => result.graduated)).toEqual([false, true]);
  });

  it('shows volume in place of market cap under the Volume sort', () => {
    const page = searchPage({ sort: 'volume', tokens: [token('0x01', { volume: '1200000000000000000' })] });
    expect(ready(page).results[0]?.figure).toEqual({ value: '1.2 NVDA', label: 'Vol', description: 'volume' });
  });

  it('shows the launch age, not the last buy, under every sort', () => {
    expect(ready(searchPage({ sort: 'newest' })).results[0]?.time.text).toBe('3h ago');
  });

  it('counts the first page as 1 to 24 of the total, with Next and no Previous', () => {
    expect(ready(searchPage({ tokens: tokens(24) })).paging).toEqual({
      range: '1 to 24 of 130',
      hasPrevious: false,
      hasNext: true,
    });
  });

  it('counts the last page to the total, with Previous and no Next', () => {
    expect(ready(searchPage({ page: 6, tokens: tokens(10) })).paging).toEqual({
      range: '121 to 130 of 130',
      hasPrevious: true,
      hasNext: false,
    });
  });

  it('formats a large total with separators', () => {
    expect(ready(searchPage({ total: 4_228 })).paging.range).toBe('1 to 2 of 4,228');
  });

  it('is loading before its first answer', () => {
    expect(searchView({ data: undefined, error: null }, NOW_MS)).toEqual({ status: 'loading' });
  });

  it('is unavailable while the route fails', () => {
    expect(searchView({ data: searchPage(), error: new ApiError(503, 'down') }, NOW_MS)).toEqual({
      status: 'unavailable',
    });
  });

  it('names the text nothing matched', () => {
    const view = searchView({ data: searchPage({ q: 'zzz', total: 0, tokens: [] }), error: null }, NOW_MS);
    expect(view).toEqual({ status: 'empty', message: 'No token matches “zzz”.', pageCount: 1 });
  });

  it('blames the filters when an empty box finds nothing under an age or pair', () => {
    const byAge = searchView({ data: searchPage({ age: '24h', total: 0, tokens: [] }), error: null }, NOW_MS);
    const byPair = searchView({ data: searchPage({ pair: NVDA.address, total: 0, tokens: [] }), error: null }, NOW_MS);
    expect(byAge).toEqual({ status: 'empty', message: 'No token matches these filters.', pageCount: 1 });
    expect(byPair).toEqual(byAge);
  });

  it('says no token has launched when an empty box with no filter finds nothing', () => {
    const view = searchView({ data: searchPage({ total: 0, tokens: [] }), error: null }, NOW_MS);
    expect(view).toEqual({ status: 'empty', message: 'No token has launched yet.', pageCount: 1 });
  });

  it('reports the page count, so a page past the end of a shrunk list can be left', () => {
    expect(ready(searchPage({ total: 130 })).pageCount).toBe(6);
    const pastTheEnd = searchView({ data: searchPage({ page: 9, total: 130, tokens: [] }), error: null }, NOW_MS);
    expect(pastTheEnd).toEqual({ status: 'empty', message: 'No token has launched yet.', pageCount: 6 });
  });
});

describe('pairOptions', () => {
  const eth: ApiPairedAsset = { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18 };

  it('offers every pair first, then each Paired asset in the order sent', () => {
    expect(pairOptions([eth, NVDA])).toEqual([
      { value: null, label: 'All' },
      { value: eth.address, label: 'ETH' },
      { value: NVDA.address, label: 'NVDA' },
    ]);
  });

  it('tells apart two Paired assets sharing a symbol by their addresses', () => {
    const other = { ...NVDA, address: '0x1111111111111111111111111111111111112222' };
    expect(pairOptions([NVDA, other]).slice(1)).toEqual([
      { value: NVDA.address, label: 'NVDA 0x0ae6…73f7' },
      { value: other.address, label: 'NVDA 0x1111…2222' },
    ]);
  });

  it('offers only every pair before the list arrives', () => {
    expect(pairOptions(undefined)).toEqual([{ value: null, label: 'All' }]);
  });
});
