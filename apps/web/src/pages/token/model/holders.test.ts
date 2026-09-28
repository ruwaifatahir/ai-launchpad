import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import type { ApiHolder, HolderPage } from '../api/holders';
import { holders } from './holders';

const holder = (overrides: Partial<ApiHolder> = {}): ApiHolder => ({
  wallet: '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044',
  balance: '12500000000000000000000000',
  share: 1.25,
  label: null,
  ...overrides,
});

const page = (overrides: Partial<HolderPage> = {}): HolderPage => ({
  tokenDecimals: 18,
  supply: '1000000000000000000000000000',
  page: 1,
  pageSize: 10,
  total: 1,
  holderCount: 1,
  holders: [holder()],
  ...overrides,
});

const ready = (data: HolderPage) => {
  const view = holders({ data, error: null });
  if (view.status !== 'ready') throw new Error('not ready');
  return view;
};

describe('holders', () => {
  it('shows each holder with its wallet, share of supply and balance', () => {
    expect(ready(page()).holders[0]).toEqual({
      rank: 1,
      wallet: '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044',
      label: null,
      share: '1.25%',
      sharePercent: 1.25,
      balance: '12.5M',
    });
  });

  it('ranks holders across pages, largest balance first', () => {
    const view = ready(page({ page: 3, pageSize: 10, total: 22, holders: [holder(), holder()] }));
    expect(view.holders.map((row) => row.rank)).toEqual([21, 22]);
  });

  it('draws a share with no supply as an empty bar', () => {
    expect(ready(page({ holders: [holder({ share: null })] })).holders[0]!.sharePercent).toBe(0);
  });

  it('formats the balance from the raw string in the decimals the route sends', () => {
    const view = ready(page({ tokenDecimals: 6, holders: [holder({ balance: '36140000' })] }));
    expect(view.holders[0]!.balance).toBe('36.14');
  });

  it('names every labelled holder, and leaves anyone else unlabelled', () => {
    const labels = [
      'bonding_curve',
      'uniswap_pool',
      'locker',
      'buyback_vault',
      'hook',
      'burn_address',
      'creator',
      null,
    ] as const;
    const view = ready(page({ total: labels.length, holders: labels.map((label) => holder({ label })) }));
    expect(view.holders.map((row) => row.label)).toEqual([
      'Bonding curve',
      'Uniswap v4 pool',
      'Locker',
      'Buyback vault',
      'Hook',
      'Burn address',
      'Creator',
      null,
    ]);
  });

  it('writes a share too small to show as under a hundredth of a percent', () => {
    const shares = [100, 0.01, 0.0042, null].map((share) => holder({ share }));
    const view = ready(page({ total: shares.length, holders: shares }));
    expect(view.holders.map((row) => row.share)).toEqual(['100.00%', '0.01%', '<0.01%', '–']);
  });

  it('takes the holder count from the route, and the pages from its total', () => {
    expect(ready(page({ total: 14, holderCount: 9 }))).toMatchObject({ holderCount: 9, pageCount: 2 });
    expect(ready(page({ total: 10, holderCount: 7 }))).toMatchObject({ holderCount: 7, pageCount: 1 });
  });

  it('reads a token with no holders, or one the indexer does not know yet, as no holders yet', () => {
    expect(holders({ data: page({ total: 0, holderCount: 0, holders: [] }), error: null }).status).toBe('empty');
    expect(holders({ data: undefined, error: new ApiError(404, 'unknown token') }).status).toBe('empty');
  });

  it('reads a 503, or any other failure, as unavailable', () => {
    expect(holders({ data: undefined, error: new ApiError(503, 'indexer down') }).status).toBe('unavailable');
    expect(holders({ data: undefined, error: new TypeError('Failed to fetch') }).status).toBe('unavailable');
  });

  it('keeps showing the last good page when a refresh fails', () => {
    expect(holders({ data: page(), error: new ApiError(503, 'indexer down') }).status).toBe('ready');
  });

  it('is loading until the first answer', () => {
    expect(holders({ data: undefined, error: null }).status).toBe('loading');
  });
});
