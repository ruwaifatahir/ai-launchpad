import { describe, expect, it } from "vitest";

import { readCurveTrade, type Trade } from "../src/trades";
import { hourOf, noTrades, withTrade } from "../src/volume";
import { load, transactionOf } from "./fixture";

function curveTrade(name: string): Trade {
  const fixture = load(name);
  const trades = fixture.logs.flatMap((log) => {
    const trade = readCurveTrade(log, {
      chainId: fixture.chainId,
      launch: fixture.launch,
      transaction: transactionOf(fixture),
    });
    return trade ? [trade] : [];
  });
  expect(trades).toHaveLength(1);
  return trades[0]!;
}

// 2026-09-22 14:00:00 UTC.
const twoPm = 1_790_085_600n;

describe("hour of a trade", () => {
  // The eth-curve-buy fixture's block time is 14:30:01 UTC.
  it("is the start of the UTC hour its block falls in", () => {
    expect(hourOf(curveTrade("eth-curve-buy").timestamp)).toBe(twoPm);
  });

  it("is the block's own time when the block is on the hour", () => {
    expect(hourOf(twoPm)).toBe(twoPm);
  });
});

describe("trade totals", () => {
  // Pons's trades API: this buy paid 0.005468088 ETH and this sell received
  // 0.0043922425916726 ETH, both on the same launch's curve.
  it("add a buy and a sell together into the volume, and count each", () => {
    const totals = [curveTrade("eth-curve-buy"), curveTrade("eth-curve-sell")].reduce(
      withTrade,
      noTrades,
    );

    expect(totals).toEqual({
      volume: 9_860_330_591_672_600n,
      buyCount: 1,
      sellCount: 1,
    });
  });
});
