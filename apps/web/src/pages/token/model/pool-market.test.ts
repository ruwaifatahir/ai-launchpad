import { describe, expect, it } from 'vitest';
import { formatPairAmount } from '@/shared/lib';
import { poolMarket, type PoolReads } from './pool-market';

const E18 = 10n ** 18n;

// TMEME's Pool on our testnet (NVDA is currency0, TMEME currency1), read on 2026-09-25.
const reads = (overrides: Partial<PoolReads> = {}): PoolReads => ({
  sqrtPriceX96: 175_482_930_525_847_350_726_226_653_184_318n,
  tokenIsCurrency0: false,
  totalSupply: 1_000_000_000n * E18,
  tokenDecimals: 18,
  pairDecimals: 18,
  ...overrides,
});

describe('poolMarket', () => {
  it('prices the token in its Paired asset, turning the Pool price round when the token is currency1', () => {
    // 2^192 / sqrtPriceX96² = 0.00000020384 NVDA per TMEME.
    expect(formatPairAmount(poolMarket(reads()).price)).toBe('0.0₆2038');
  });

  it('values the market cap at price × total supply in the Paired asset', () => {
    expect(formatPairAmount(poolMarket(reads()).marketCap)).toBe('203.84');
  });

  it('reads the Pool price as it is when the token is currency0', () => {
    // sqrtPriceX96² / 2^192 = 4,905,808.48 of the Paired asset per token.
    expect(formatPairAmount(poolMarket(reads({ tokenIsCurrency0: true })).price)).toBe('4,905,808.48');
  });

  it('scales by the decimals of each side', () => {
    // The same Pool price in a 6-decimal Paired asset's base units is 10^12 times more whole units.
    expect(formatPairAmount(poolMarket(reads({ pairDecimals: 6 })).marketCap)).toBe('203,840,000,000,000');
  });

  it('shows zero for a Pool with no price yet', () => {
    expect(poolMarket(reads({ sqrtPriceX96: 0n }))).toEqual({ price: 0, marketCap: 0 });
  });
});
