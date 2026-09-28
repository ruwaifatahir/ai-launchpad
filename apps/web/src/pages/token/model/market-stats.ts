import { formatDollars, formatPairAmount } from '@/shared/lib';
import type { CurveMarket } from './curve-market';
import type { PoolMarket } from './pool-market';
import type { TokenStage } from './token-stage';

export type MarketStats = { price: string; marketCap: string; priceInPair: string; venue: string };

/** What a stat shows while there is nothing to show. */
const PENDING = '–';

/** The market the token trades on in its stage, and where: the curve, the pool, or nowhere. */
export function liveMarket(
  stage: TokenStage,
  curve: CurveMarket | null,
  pool: PoolMarket | null,
): { market: CurveMarket | PoolMarket | null; venue: string | null } {
  if (stage.kind === 'pool') return { market: pool, venue: 'Uniswap v4' };
  if (stage.kind === 'bonding-curve') return { market: curve, venue: 'Bonding curve' };
  return { market: null, venue: null };
}

/**
 * The stats row from the chain reads: Price and Market cap in dollars at the Paired asset's Dollar
 * rate, or in the Paired asset without one; Price in the Paired asset always. Only the Bonding curve
 * and the Pool have a market to read. In any other stage the token trades nowhere, so every entry
 * shows as a dash.
 */
export function marketStats(
  stage: TokenStage,
  curve: CurveMarket | null,
  pool: PoolMarket | null,
  pair: { symbol: string; rate: number | null },
): MarketStats {
  const { market: live, venue } = liveMarket(stage, curve, pool);
  const inPair = (value: number | undefined) =>
    value === undefined ? PENDING : `${formatPairAmount(value)} ${pair.symbol}`;
  const shown = (value: number | undefined) =>
    value === undefined ? PENDING : pair.rate === null ? inPair(value) : formatDollars(value * pair.rate);
  return {
    price: shown(live?.price),
    marketCap: shown(live?.marketCap),
    priceInPair: inPair(live?.price),
    venue: venue ?? PENDING,
  };
}
