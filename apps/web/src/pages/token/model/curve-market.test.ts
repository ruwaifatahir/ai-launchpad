import { describe, expect, it } from 'vitest';
import { formatPairAmount } from '@/shared/lib';
import { curveMarket, type CurveReads } from './curve-market';

const E18 = 10n ** 18n;

// A live NVDA launch on our testnet (curve 0xe130…66d5), read on 2026-09-25.
const reads = (overrides: Partial<CurveReads> = {}): CurveReads => ({
  quoteReserve: 17_630_000_000_000_000_000n,
  tokenReserve: 943_845_717_526_942_711_287_577_993n,
  realQuoteReserve: 990_000_000_000_000_000n,
  graduationThreshold: 41_600_000_000_000_000_000n,
  totalSupply: 1_000_000_000n * E18,
  tokenDecimals: 18,
  pairDecimals: 18,
  ...overrides,
});

describe('curveMarket', () => {
  it('prices the token as quoteReserve / tokenReserve in the Paired asset', () => {
    expect(formatPairAmount(curveMarket(reads()).price)).toBe('0.0₇1868');
  });

  it('values the market cap at price × total supply in the Paired asset', () => {
    expect(formatPairAmount(curveMarket(reads()).marketCap)).toBe('18.68');
  });

  it('measures Graduation progress as realQuoteReserve / graduationThreshold', () => {
    expect(curveMarket(reads()).progress).toEqual({ percent: 2.37, raised: 0.99, target: 41.6 });
  });

  it('is empty before the first buy and full once the curve has raised its target', () => {
    expect(curveMarket(reads({ realQuoteReserve: 0n })).progress).toMatchObject({ percent: 0, raised: 0 });
    expect(curveMarket(reads({ realQuoteReserve: 41_600_000_000_000_000_000n })).progress.percent).toBe(100);
    // The last buy can overshoot the threshold by the refunded rounding.
    expect(curveMarket(reads({ realQuoteReserve: 41_700_000_000_000_000_000n })).progress.percent).toBe(100);
  });

  it('scales by the decimals of each side', () => {
    // A 6-decimal Paired asset: 17.63 units against the same token reserve.
    const market = curveMarket(reads({ quoteReserve: 17_630_000n, pairDecimals: 6 }));
    expect(formatPairAmount(market.price)).toBe('0.0₇1868');
    expect(formatPairAmount(market.marketCap)).toBe('18.68');
  });
});
