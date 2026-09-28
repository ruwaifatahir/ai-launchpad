import { zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import { readCurveTrade, type Trade } from "../src/trades";
import { fixtureNames, load, lower, price, transactionOf, type Fixture } from "./fixture";

// What a handler does: every log of the transaction goes through the reader.
function curveTrades(fixture: Fixture): Trade[] {
  return fixture.logs.flatMap((log) => {
    const trade = readCurveTrade(log, {
      chainId: fixture.chainId,
      launch: fixture.launch,
      transaction: transactionOf(fixture),
    });
    return trade ? [trade] : [];
  });
}

function onlyTrade(fixture: Fixture): Trade {
  const trades = curveTrades(fixture);
  expect(trades).toHaveLength(1);
  return trades[0]!;
}

describe("every curve fixture matches Pons's trades API", () => {
  // Pool fixtures, which name a pool, are in pool-trades.test.ts.
  const names = fixtureNames().filter((name) => !load(name).launch.poolId);

  it.each(names)("%s", (name) => {
    const fixture = load(name);
    const [pons] = fixture.pons;
    expect(fixture.pons).toHaveLength(1);

    const trade = onlyTrade(fixture);

    expect(trade.id).toBe(pons!.id);
    expect(trade.launch).toBe(fixture.launch.token);
    expect(trade.venue).toBe(pons!.venue);
    expect(trade.side).toBe(pons!.side);
    expect(trade.launchTokenAmount).toBe(BigInt(pons!.tokenAmount));
    expect(trade.quoteAmount).toBe(BigInt(pons!.quoteAmount));
    expect(trade.blockNumber).toBe(BigInt(pons!.blockNumber));
    expect(trade.timestamp).toBe(BigInt(pons!.timestamp));
    expect(lower(trade.transactionHash)).toBe(lower(pons!.transactionHash));
    expect(trade.chainId).toBe(fixture.chainId);
  });
});

describe("curve trades", () => {
  it("records a buy with its fee and creator tax, the fee including the snipe tax", () => {
    const trade = onlyTrade(load("eth-curve-buy"));

    expect(trade).toMatchObject({
      venue: "curve",
      kind: "user",
      side: "buy",
      launchTokenAmount: 2660687685796831338434729n,
      quoteAmount: 5468088000000000n,
      // 0.0054680880 ETH at 1% fee + 6.18% snipe tax (SnipeTaxCharged 337927838400000).
      fee: 392608718400000n,
      creatorTax: 54680880000000n,
      feeAsset: "quote_asset",
      logIndex: 47,
    });
  });

  it("records a sell with its fee and creator tax", () => {
    const trade = onlyTrade(load("eth-curve-sell"));

    expect(trade).toMatchObject({
      side: "sell",
      launchTokenAmount: 2660687685796831338434729n,
      quoteAmount: 4392242591672600n,
      fee: 44818801955842n,
      creatorTax: 44818801955842n,
    });
  });

  it("takes the trader from the signer, not the contract that called the curve", () => {
    const fixture = load("eth-curve-buy");
    const trade = onlyTrade(fixture);

    // The curve saw a contract as buyer and recipient; the signer is the wallet behind it.
    expect(lower(trade.trader)).toBe("0xb105d1d9df6e0fbb89a7e4d96be9950f86a27ec7");
    expect(lower(trade.trader)).not.toBe(fixture.pons[0]!.account);
  });

  it("shows a developer buy through LaunchAndBuy as the creator's", () => {
    const fixture = load("eth-launch-developer-buy");
    const trade = onlyTrade(fixture);

    expect(lower(trade.trader)).toBe(lower(fixture.launch.creator));
    // Quoted in native ETH.
    expect(fixture.launch.quoteAsset).toBe(zeroAddress);
    expect(trade).toMatchObject({ side: "buy", quoteAmount: 100000000000000000n });
  });

  it("reads a stock-quoted launch in the stock token's units", () => {
    const fixture = load("stock-curve-buy");
    const trade = onlyTrade(fixture);

    // Quoted in GOOGL, an 18-decimal stock token, not native ETH.
    expect(fixture.launch.quoteAsset).not.toBe(zeroAddress);
    expect(trade).toMatchObject({ side: "buy", quoteAmount: 385393844004177n });
    expect(lower(trade.trader)).toBe("0xd523aaca0da819f24f08bd93591c1a99cbcbb150");
  });

  it("ignores logs of other curves, and logs that are not trades", () => {
    const fixture = load("eth-launch-developer-buy");
    const otherCurve = {
      ...fixture,
      launch: { ...fixture.launch, curve: fixture.launch.token },
    };

    expect(curveTrades(otherCurve)).toEqual([]);
    // The launch transaction also holds the curve's Initialized and SnipeTaxExempted,
    // and only its CurveBuy is a trade.
    const curveLogs = fixture.logs.filter(
      (log) => lower(log.address) === lower(fixture.launch.curve),
    );
    expect(curveLogs).toHaveLength(4);
    expect(curveTrades({ ...fixture, logs: curveLogs }).map((t) => t.logIndex)).toEqual([
      29,
    ]);
  });
});

// Price is quote amount / launch token amount, so with the amounts above equal to Pons's
// trades API, so are the prices. Pons's chart prices, read from /api/pons-v2-market/<token>/chart on 2026-09-25. Each is
// the close of a bucket whose last trade is the fixture's. They are reproduced by the
// amounts as the curve emits them (a buy's quote in, fees included; a sell's quote out,
// after fees), and not by the other way round, which is about 2.3% off.
describe("Pons's chart prices", () => {
  it.each([
    ["eth-curve-sell", 1.6507922425916728e-9],
    ["stock-curve-buy", 9.909037480717938e-9],
    ["stock-curve-sell", 9.457727869606599e-9],
  ])("%s closes at %d", (name, chartPrice) => {
    const trade = onlyTrade(load(name));

    expect(price(trade.quoteAmount, trade.launchTokenAmount) / chartPrice).toBeCloseTo(
      1,
      12,
    );

    const otherWay =
      trade.side === "buy"
        ? trade.quoteAmount - trade.fee - trade.creatorTax
        : trade.quoteAmount + trade.fee + trade.creatorTax;
    expect(
      Math.abs(price(otherWay, trade.launchTokenAmount) / chartPrice - 1),
    ).toBeGreaterThan(0.02);
  });
});
