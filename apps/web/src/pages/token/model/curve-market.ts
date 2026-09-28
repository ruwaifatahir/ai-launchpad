import { formatUnits } from 'viem';

/** What the Token page reads from a Bonding curve and its token to show the market. */
export type CurveReads = {
  /** `getReserves()`: the phantom reserve included, pending fees excluded. */
  quoteReserve: bigint;
  tokenReserve: bigint;
  /** The Paired asset actually raised so far. */
  realQuoteReserve: bigint;
  /** The Paired asset the curve must raise to sell out. */
  graduationThreshold: bigint;
  totalSupply: bigint;
  tokenDecimals: number;
  pairDecimals: number;
};

/** A Bonding curve's market, in whole units of the Paired asset. */
export type CurveMarket = {
  /** Paired asset per token. */
  price: number;
  marketCap: number;
  progress: {
    /** 0 to 100. */
    percent: number;
    raised: number;
    target: number;
  };
};

/** Extra digits kept when dividing, so a price of a tiny fraction of the Paired asset survives. */
const PRICE_PRECISION = 18;

/**
 * The Bonding curve's price, market cap and Graduation progress.
 * Price = quoteReserve / tokenReserve; market cap = price × total supply.
 */
export function curveMarket(reads: CurveReads): CurveMarket {
  const { quoteReserve, tokenReserve, realQuoteReserve, graduationThreshold, totalSupply } = reads;
  const tokenUnit = 10n ** BigInt(reads.tokenDecimals);
  const precision = 10n ** BigInt(PRICE_PRECISION);

  const price =
    tokenReserve > 0n
      ? Number(formatUnits((quoteReserve * tokenUnit * precision) / tokenReserve, reads.pairDecimals + PRICE_PRECISION))
      : 0;
  const marketCap =
    tokenReserve > 0n ? Number(formatUnits((quoteReserve * totalSupply) / tokenReserve, reads.pairDecimals)) : 0;
  const percent =
    graduationThreshold > 0n ? Math.min(100, Number((realQuoteReserve * 10_000n) / graduationThreshold) / 100) : 0;

  return {
    price,
    marketCap,
    progress: {
      percent,
      raised: Number(formatUnits(realQuoteReserve, reads.pairDecimals)),
      target: Number(formatUnits(graduationThreshold, reads.pairDecimals)),
    },
  };
}
