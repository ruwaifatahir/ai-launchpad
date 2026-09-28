import { describe, expect, it } from 'vitest';
import type { ApiListedToken } from '@/entities/token';
import type { CreatorTokensPage } from '../api/creator-tokens';
import { creatorTokensList } from './creator-tokens';

const NOW_MS = 1_790_000_000_000;
const CREATOR = '0xa0cf798816d4b9b9866b5330eea46a18382f251e';

const token = (address: string): ApiListedToken => ({
  token: address,
  name: 'Test Meme',
  symbol: 'TMEME',
  logo: '',
  creator: CREATOR,
  marketCap: '3000000000000000000',
  quoteAsset: { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18 },
  quoteUsd: null,
  progress: 40,
  graduated: false,
  launchedAt: NOW_MS / 1000 - 60,
  lastBuyAt: NOW_MS / 1000 - 5,
});

const page = (tokens: ApiListedToken[], total = tokens.length): CreatorTokensPage => ({
  page: 1,
  pageSize: 24,
  total,
  tokens,
});

const list = (data: CreatorTokensPage | undefined, { error = null as unknown, own = false } = {}) =>
  creatorTokensList({ data, error }, { own, nowMs: NOW_MS });

describe('creatorTokensList', () => {
  it('is loading before the first answer, with no count or pages', () => {
    expect(list(undefined)).toEqual({ count: null, pageCount: null, grid: { status: 'loading' } });
  });

  it('is unavailable while the route fails, even with an older answer at hand', () => {
    const failed = { status: 'unavailable' };
    expect(list(undefined, { error: new Error('503') }).grid).toEqual(failed);
    expect(list(page([token('0x01')]), { error: new Error('503') })).toEqual({
      count: null,
      pageCount: null,
      grid: failed,
    });
  });

  it('shows each token as a card with its launch time', () => {
    const view = list(page([token('0x01'), token('0x02')]));
    expect(view.grid.status).toBe('ready');
    if (view.grid.status !== 'ready') return;
    expect(view.grid.tokens.map((card) => card.address)).toEqual(['0x01', '0x02']);
    expect(view.grid.tokens[0]?.time).toMatchObject({ text: '1m ago', recentBuy: false });
  });

  it('counts every token the wallet launched, not only this page', () => {
    expect(list(page([token('0x01')], 1)).count).toBe('1 token launched');
    expect(list(page([token('0x01')], 1234)).count).toBe('1,234 tokens launched');
    expect(list(page([], 0)).count).toBe('No tokens launched');
  });

  it('pages from the total and the page size', () => {
    expect(list(page([token('0x01')], 49)).pageCount).toBe(3);
    expect(list(page([], 0)).pageCount).toBe(1);
  });

  it('speaks to the Creator on their own empty Profile, and about the wallet on anyone else’s', () => {
    expect(list(page([]), { own: true }).grid).toEqual({
      status: 'empty',
      message: 'You haven’t launched a token yet.',
    });
    expect(list(page([])).grid).toEqual({ status: 'empty', message: 'This wallet hasn’t launched a token yet.' });
  });
});
