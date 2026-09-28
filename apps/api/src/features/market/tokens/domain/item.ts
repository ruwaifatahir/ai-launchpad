import {
  type DollarRates,
  readDollarRates,
} from "@/features/market/dollar-rates/reading";
import { percentOf } from "@/features/market/pricing";
import {
  type ListFilter,
  type ListedLaunchRow,
  findListedLaunches,
} from "@/features/market/tokens/tokens.repo";

// How far the curve is toward graduation, as a percent from 0 to 100. A graduated
// token is at 100 whatever its frozen curve holds. A curve that closed just past its
// threshold is capped at 100. A threshold of zero, which the launchpad cannot set, has
// nothing left to reach, so it reads as 100 too.
const progressOf = (row: ListedLaunchRow) => {
  if (row.graduated) return 100;

  const progress = percentOf(row.curveQuoteReserve, row.graduationThreshold);

  return progress === null ? 100 : Math.min(100, progress);
};

// A token as every list serves it. The logo is passed through untouched: the Panel
// resolves ipfs:// and https:// links itself. quoteUsd is the quote asset's dollar rate,
// null where it has none, and the Panel works out every figure in dollars from it.
// volume is served only when the row carries it, which is under the volume sort alone.
export const listedToken = (row: ListedLaunchRow, rates: DollarRates) => ({
  token: row.token,
  name: row.name,
  symbol: row.symbol,
  logo: row.logo,
  creator: row.creator,
  marketCap: row.marketCap,
  quoteAsset: {
    address: row.quoteAddress,
    symbol: row.quoteSymbol,
    decimals: row.quoteDecimals,
  },
  quoteUsd: rates.get(row.quoteAddress) ?? null,
  progress: progressOf(row),
  graduated: row.graduated,
  launchedAt: row.launchedAt,
  lastBuyAt: row.lastBuyAt,
  ...(row.volume !== undefined && { volume: row.volume }),
});

// One page of a list, each token beside its quote asset's dollar rate. The rates are
// read first, because the page is ranked by them, so a caller starts its counts
// alongside this rather than after it, and a slow feed costs the list one wait.
export const readListedTokens = async (
  filter: ListFilter,
  window: { limit: number; offset: number },
) => {
  const rates = await readDollarRates();
  const rows = await findListedLaunches(filter, window, rates);

  return rows.map((row) => listedToken(row, rates));
};
