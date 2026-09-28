import type { Trade } from "./trades";

// Volume keeping. Nothing here touches Ponder or the database, so it is tested against
// recorded Pons mainnet trades (test/volume.test.ts).

const secondsPerHour = 3600n;

/** The start of the UTC hour a block time falls in, in seconds. */
export function hourOf(timestamp: bigint): bigint {
  return timestamp - (timestamp % secondsPerHour);
}

// A launch's trading over some span: all time, or one hour. User trades only.
export type TradeTotals = {
  // In the quote asset's raw units: each trade's quoteAmount, buys and sells together.
  volume: bigint;
  buyCount: number;
  sellCount: number;
};

export const noTrades: TradeTotals = { volume: 0n, buyCount: 0, sellCount: 0 };

/** The totals with one more user trade in them. */
export function withTrade(
  totals: TradeTotals,
  trade: Pick<Trade, "side" | "quoteAmount">,
): TradeTotals {
  return {
    volume: totals.volume + trade.quoteAmount,
    buyCount: totals.buyCount + (trade.side === "buy" ? 1 : 0),
    sellCount: totals.sellCount + (trade.side === "sell" ? 1 : 0),
  };
}
