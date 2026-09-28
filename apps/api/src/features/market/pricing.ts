// Every Pons V2 launch token is minted with 18 decimals, so the indexer stores none.
export const TOKEN_DECIMALS = 18;

// Twelve decimal places of a percent, worked in integers so an amount past what a float
// holds loses nothing before the one division at the end.
const PERCENT_SCALE = 10n ** 12n;

// part as a percent of whole, each a raw integer string: 12.5 is 12.5%. Null for a
// whole of zero.
export const percentOf = (part: string, whole: string) => {
  const total = BigInt(whole);
  if (total === 0n) return null;

  return Number((BigInt(part) * 100n * PERCENT_SCALE) / total) / Number(PERCENT_SCALE);
};

// What one trade moved, as raw integer strings: the token in TOKEN_DECIMALS and the
// quote asset in its own decimals.
export interface TradeAmounts {
  tokenAmount: string;
  quoteAmount: string;
}

// Quote per token, each amount in its own decimals. A float, because a price is for
// drawing and comparing, never for settling. Null only for a trade that moved no
// token, which the launchpad cannot produce.
export const priceOf = (trade: TradeAmounts, quoteDecimals: number) => {
  const tokens = Number(trade.tokenAmount) / 10 ** TOKEN_DECIMALS;
  const quote = Number(trade.quoteAmount) / 10 ** quoteDecimals;

  return tokens === 0 ? null : quote / tokens;
};
