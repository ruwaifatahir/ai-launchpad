import { formatUnits } from 'viem';

/** What the Token page reads from a Pool and its token to show the market. */
export type PoolReads = {
  /** StateView `getSlot0`: √(currency1 per currency0) in base units, as a Q64.96. */
  sqrtPriceX96: bigint;
  /** Whether the token sorts before its Paired asset in the PoolKey. */
  tokenIsCurrency0: boolean;
  totalSupply: bigint;
  tokenDecimals: number;
  pairDecimals: number;
};

/** A Pool's market, in whole units of the Paired asset. */
export type PoolMarket = {
  /** Paired asset per token. */
  price: number;
  marketCap: number;
};

const Q192 = 2n ** 192n;

/** Extra digits kept when dividing, so a price of a tiny fraction of the Paired asset survives. */
const PRICE_PRECISION = 18;

/**
 * The Pool's price and market cap. The Pool's price is currency1 per currency0, squared out of
 * `sqrtPriceX96`; it is turned round when the token is currency1, so it is always Paired asset per
 * token. Market cap = price × total supply.
 */
export function poolMarket(reads: PoolReads): PoolMarket {
  const { sqrtPriceX96, tokenIsCurrency0, totalSupply } = reads;
  if (sqrtPriceX96 === 0n) return { price: 0, marketCap: 0 };

  const squared = sqrtPriceX96 * sqrtPriceX96;
  /** `amount` of the token in base units, valued in the Paired asset's base units. */
  const inPair = (amount: bigint) => (tokenIsCurrency0 ? (amount * squared) / Q192 : (amount * Q192) / squared);
  const tokenUnit = 10n ** BigInt(reads.tokenDecimals);
  const precision = 10n ** BigInt(PRICE_PRECISION);

  return {
    price: Number(formatUnits(inPair(tokenUnit * precision), reads.pairDecimals + PRICE_PRECISION)),
    marketCap: Number(formatUnits(inPair(totalSupply), reads.pairDecimals)),
  };
}
