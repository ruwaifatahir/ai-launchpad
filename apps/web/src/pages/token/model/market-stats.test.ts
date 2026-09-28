import { describe, expect, it } from 'vitest';
import type { CurveMarket } from './curve-market';
import { marketStats } from './market-stats';
import type { PoolMarket } from './pool-market';

// A YOYO-like curve: 0.0000000798 NVDA per token, 79.8 NVDA market cap.
const curve: CurveMarket = {
  price: 7.98e-8,
  marketCap: 79.8,
  progress: { percent: 47.59, raised: 19.8, target: 41.6 },
};
const pool: PoolMarket = { price: 0.000307149, marketCap: 291_638.4 };

describe('marketStats', () => {
  it('shows a curve token in the Paired asset when it has no Dollar rate', () => {
    expect(marketStats({ kind: 'bonding-curve' }, curve, null, { symbol: 'NVDA', rate: null })).toEqual({
      price: '0.0₇798 NVDA',
      marketCap: '79.8 NVDA',
      priceInPair: '0.0₇798 NVDA',
      venue: 'Bonding curve',
    });
  });

  it('shows Price and Market cap in dollars at the Dollar rate, and Price in the Paired asset as it was', () => {
    // At $225.66018707 per NVDA.
    expect(marketStats({ kind: 'bonding-curve' }, curve, null, { symbol: 'NVDA', rate: 225.66018707 })).toEqual({
      price: '$0.0₄1801',
      marketCap: '$18,007.68',
      priceInPair: '0.0₇798 NVDA',
      venue: 'Bonding curve',
    });
  });

  it('reads a pool token from the pool', () => {
    expect(marketStats({ kind: 'pool' }, null, pool, { symbol: 'ETH', rate: 2691.30180413 })).toEqual({
      price: '$0.8266',
      marketCap: '$784,886,952.07',
      priceInPair: '0.0003071 ETH',
      venue: 'Uniswap v4',
    });
  });

  it('shows a dash for every figure while the token trades nowhere', () => {
    expect(
      marketStats({ kind: 'graduation-pending', nextStep: 'graduate' }, curve, null, { symbol: 'NVDA', rate: 225 }),
    ).toEqual({
      price: '–',
      marketCap: '–',
      priceInPair: '–',
      venue: '–',
    });
  });

  it('shows a dash while the market it trades on has not been read yet', () => {
    expect(marketStats({ kind: 'pool' }, null, null, { symbol: 'ETH', rate: 2691 }).price).toBe('–');
  });
});
