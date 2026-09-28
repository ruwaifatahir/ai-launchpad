import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import type { ApiTrade, TradePage } from '../api/recent-trades';
import { recentTrades } from './recent-trades';

const NOW = 1_790_000_000_000;
const NOW_S = NOW / 1000;

const trade = (overrides: Partial<ApiTrade> = {}): ApiTrade => ({
  id: 'trade-1',
  side: 'buy',
  kind: 'user',
  venue: 'curve',
  trader: '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044',
  tokenAmount: '1890000000000000000000',
  quoteAmount: '581307000000000000',
  price: 0.0003075,
  timestamp: NOW_S,
  transactionHash: '0xbe28e3b3c4465514a7f402295f61d1c5d4d8d9e123f29e3162ad617d8d0ce44e',
  ...overrides,
});

const page = (overrides: Partial<TradePage> = {}): TradePage => ({
  tokenDecimals: 18,
  quoteDecimals: 18,
  quoteSymbol: 'ETH',
  page: 1,
  pageSize: 10,
  total: 1,
  trades: [trade()],
  ...overrides,
});

describe('recentTrades', () => {
  it('formats amounts from raw strings in the decimals the route sends', () => {
    const view = recentTrades(
      {
        data: page({
          tokenDecimals: 6,
          quoteDecimals: 8,
          trades: [trade({ tokenAmount: '36140000', quoteAmount: '1109800' })],
        }),
        error: null,
      },
      NOW,
    );
    if (view.status !== 'ready') throw new Error('not ready');
    expect(view.trades[0]).toMatchObject({ amount: '36.14', pairAmount: '0.011098' });
  });

  it('writes a large token amount compactly and keeps the Paired asset amount to six decimals', () => {
    const view = recentTrades({ data: page(), error: null }, NOW);
    if (view.status !== 'ready') throw new Error('not ready');
    expect(view.trades[0]).toMatchObject({ amount: '1.89K', pairAmount: '0.581307' });
  });

  it('labels buybacks and fee conversions, and leaves a user trade unlabelled', () => {
    const view = recentTrades(
      {
        data: page({
          total: 3,
          trades: [
            trade({ id: 'a', kind: 'user' }),
            trade({ id: 'b', kind: 'buyback' }),
            trade({ id: 'c', kind: 'fee_conversion', side: 'sell' }),
          ],
        }),
        error: null,
      },
      NOW,
    );
    if (view.status !== 'ready') throw new Error('not ready');
    expect(view.trades.map((row) => row.label)).toEqual([null, 'Buyback', 'Fee conversion']);
  });

  it('names the venue and links the trade by its transaction and trader', () => {
    const view = recentTrades(
      { data: page({ total: 2, trades: [trade({ id: 'a' }), trade({ id: 'b', venue: 'pool' })] }), error: null },
      NOW,
    );
    if (view.status !== 'ready') throw new Error('not ready');
    expect(view.trades.map((row) => row.venue)).toEqual(['Bonding curve', 'Uniswap v4']);
    expect(view.trades[0]).toMatchObject({
      id: 'a',
      side: 'buy',
      wallet: '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044',
      txHash: '0xbe28e3b3c4465514a7f402295f61d1c5d4d8d9e123f29e3162ad617d8d0ce44e',
    });
  });

  it('gives each trade its time and its age', () => {
    const at = (secondsAgo: number) => {
      const view = recentTrades(
        { data: page({ trades: [trade({ timestamp: NOW_S - secondsAgo })] }), error: null },
        NOW,
      );
      if (view.status !== 'ready') throw new Error('not ready');
      return view.trades[0]!;
    };
    expect(at(0).datetime).toBe(new Date(NOW).toISOString());
    // The full time is written in the reader's time zone, so only its year is fixed here.
    expect(at(0).fullTime).toContain(String(new Date(NOW).getFullYear()));
    expect([at(30), at(300), at(7_200), at(3 * 86_400)].map((row) => row.age)).toEqual(['now', '5m', '2h', '3d']);
    // The indexer's clock and the browser's can disagree by a little.
    expect(at(-5).age).toBe('now');
  });

  it('counts the pages from the total', () => {
    expect(recentTrades({ data: page({ total: 1 }), error: null }, NOW)).toMatchObject({ total: 1, pageCount: 1 });
    expect(recentTrades({ data: page({ total: 10 }), error: null }, NOW)).toMatchObject({ total: 10, pageCount: 1 });
    expect(recentTrades({ data: page({ total: 11 }), error: null }, NOW)).toMatchObject({ total: 11, pageCount: 2 });
    expect(recentTrades({ data: page({ total: 93 }), error: null }, NOW)).toMatchObject({ total: 93, pageCount: 10 });
  });

  it('reads a token with no trades, or one the indexer does not know yet, as no trades yet', () => {
    expect(recentTrades({ data: page({ total: 0, trades: [] }), error: null }, NOW).status).toBe('empty');
    expect(recentTrades({ data: undefined, error: new ApiError(404, 'unknown token') }, NOW).status).toBe('empty');
  });

  it('reads a 503, or any other failure, as unavailable', () => {
    expect(recentTrades({ data: undefined, error: new ApiError(503, 'indexer down') }, NOW).status).toBe('unavailable');
    expect(recentTrades({ data: undefined, error: new TypeError('Failed to fetch') }, NOW).status).toBe('unavailable');
  });

  it('keeps showing the last good page when a refresh fails', () => {
    expect(recentTrades({ data: page(), error: new ApiError(503, 'indexer down') }, NOW).status).toBe('ready');
  });

  it('is loading until the first answer', () => {
    expect(recentTrades({ data: undefined, error: null }, NOW).status).toBe('loading');
  });
});
