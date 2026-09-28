import { decodeEventLog, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import { PoolManagerAbi } from "../abis/PoolManagerAbi";
import { readPoolTrade, type RawLog, type Trade } from "../src/trades";
import { fixtureNames, load, lower, price, transactionOf, type Fixture } from "./fixture";

function poolOf(fixture: Fixture) {
  const { poolId } = fixture.launch;
  if (!poolId || !fixture.hook || !fixture.poolManager) {
    throw new Error("Not a pool fixture");
  }
  return {
    chainId: fixture.chainId,
    contracts: { hook: fixture.hook, poolManager: fixture.poolManager },
    launch: { ...fixture.launch, poolId },
    receiptLogs: fixture.logs,
    transaction: transactionOf(fixture),
  };
}

// What the handler does: every hook log of the transaction goes through the reader, with
// the whole receipt.
function poolTrades(fixture: Fixture): Trade[] {
  const pool = poolOf(fixture);
  return fixture.logs
    .filter((log) => lower(log.address) === lower(pool.contracts.hook))
    .flatMap((log) => {
      const trade = readPoolTrade(log, pool);
      return trade ? [trade] : [];
    });
}

function onlyTrade(fixture: Fixture): Trade {
  const trades = poolTrades(fixture);
  expect(trades).toHaveLength(1);
  return trades[0]!;
}

// The PoolManager Swaps of a fixture, by pool id.
function swapPoolIds(logs: RawLog[], poolManager: string) {
  return logs
    .filter((log) => lower(log.address) === lower(poolManager))
    .flatMap((log) => {
      try {
        const event = decodeEventLog({ abi: PoolManagerAbi, ...log });
        return event.eventName === "Swap" ? [event.args.id] : [];
      } catch {
        return [];
      }
    });
}

describe("every pool fixture matches Pons's trades API", () => {
  // A sweep's trades are the hook's own (test/hook-trades.test.ts).
  const names = fixtureNames().filter(
    (name) => load(name).launch.poolId && !name.includes("-sweep-"),
  );

  it("covers the pool fixtures", () => {
    expect(names.sort()).toEqual([
      "eth-pool-buy",
      "eth-pool-sell",
      "pool-several-swaps",
      "stock-pool-sell-beside-other-pool",
    ]);
  });

  it.each(names)("%s", (name) => {
    const fixture = load(name);
    const trades = poolTrades(fixture);

    expect(trades.map((trade) => trade.id).sort()).toEqual(
      fixture.pons.map((pons) => pons.id).sort(),
    );
    for (const pons of fixture.pons) {
      const trade = trades.find((t) => t.id === pons.id)!;
      expect(trade.launch).toBe(fixture.launch.token);
      expect(trade.venue).toBe(pons.venue);
      expect(trade.side).toBe(pons.side);
      expect(trade.launchTokenAmount).toBe(BigInt(pons.tokenAmount));
      expect(trade.quoteAmount).toBe(BigInt(pons.quoteAmount));
      expect(price(trade.quoteAmount, trade.launchTokenAmount)).toBe(
        price(BigInt(pons.quoteAmount), BigInt(pons.tokenAmount)),
      );
      expect(trade.blockNumber).toBe(BigInt(pons.blockNumber));
      expect(trade.timestamp).toBe(BigInt(pons.timestamp));
      expect(lower(trade.transactionHash)).toBe(lower(pons.transactionHash));
      expect(trade.chainId).toBe(fixture.chainId);
    }
  });
});

describe("pool trades", () => {
  it("records a buy, with the fee and creator tax the hook took in the launch token", () => {
    const trade = onlyTrade(load("eth-pool-buy"));

    expect(trade).toMatchObject({
      venue: "pool",
      kind: "user",
      side: "buy",
      // The Swap's amounts, before the hook's cut.
      launchTokenAmount: 14257300716411538326825650n,
      quoteAmount: 84041973727512468n,
      // An exact-input buy: the hook takes its 1% + 1% of the unspecified side, the
      // launch token.
      fee: 142573007164115383268256n,
      creatorTax: 142573007164115383268256n,
      feeAsset: "launch_token",
      logIndex: 87,
    });
  });

  it("records a sell, with the fee and creator tax the hook took in the quote asset", () => {
    const trade = onlyTrade(load("eth-pool-sell"));

    expect(trade).toMatchObject({
      side: "sell",
      launchTokenAmount: 703915310862831819327852n,
      quoteAmount: 25153365926951055n,
      fee: 251533659269510n,
      creatorTax: 503067318539021n,
      feeAsset: "quote_asset",
      logIndex: 74,
    });
  });

  it("takes the trader from the signer, not the Uniswap router", () => {
    for (const name of ["eth-pool-buy", "eth-pool-sell"]) {
      const fixture = load(name);
      const trade = onlyTrade(fixture);

      expect(lower(trade.trader)).toBe(lower(fixture.transaction.from));
      // Pons shows the router.
      expect(fixture.pons[0]!.account).toBe("0x8876789976decbfcbbbe364623c63652db8c0904");
      expect(lower(trade.trader)).not.toBe(fixture.pons[0]!.account);
    }
  });

  it("pairs each hook event with the Swap just before it, when one pool swaps several times", () => {
    const fixture = load("pool-several-swaps");
    const trades = poolTrades(fixture);

    // Two sells then two buys in the launch's pool, each at its own Swap's log index and
    // with its own hook event's fee and creator tax.
    expect(
      trades.map((t) => [
        t.logIndex,
        t.side,
        t.launchTokenAmount,
        t.fee,
        t.creatorTax,
        t.feeAsset,
      ]),
    ).toEqual([
      [90, "sell", 456702739973934659252n, 753171979998n, 1882929949996n, "quote_asset"],
      [186, "sell", 330930280652605388830n, 545748185547n, 1364370463868n, "quote_asset"],
      [
        261,
        "buy",
        44419801208208185311309n,
        444198012082081853113n,
        1110495030205204632782n,
        "launch_token",
      ],
      [
        281,
        "buy",
        553681661448204814041n,
        5536816614482048140n,
        13842041536205120351n,
        "launch_token",
      ],
    ]);
    // A contract did the swaps; the trader is the wallet that signed.
    for (const trade of trades) {
      expect(lower(trade.trader)).toBe(lower(fixture.transaction.from));
      expect(lower(trade.trader)).not.toBe(fixture.pons[0]!.account);
    }
  });

  it("ignores hook events of another of our pools in the same transaction", () => {
    const fixture = load("pool-several-swaps");
    const pool = poolOf(fixture);
    const hookLogs = fixture.logs.filter(
      (log) => lower(log.address) === lower(pool.contracts.hook),
    );

    // Six HookFeeCollected: four in this launch's pool, two in another launch's.
    expect(hookLogs).toHaveLength(6);
    expect(poolTrades(fixture)).toHaveLength(4);
  });

  it("ignores a Swap in a pool that isn't ours, in the same transaction", () => {
    const fixture = load("stock-pool-sell-beside-other-pool");
    const pools = swapPoolIds(fixture.logs, fixture.poolManager!);

    // The router went through someone else's pool too.
    expect(pools).toHaveLength(2);
    expect(pools.filter((id) => id !== fixture.launch.poolId)).toHaveLength(1);

    const trade = onlyTrade(fixture);
    // Quoted in a stock token, not native ETH.
    expect(fixture.launch.quoteAsset).not.toBe(zeroAddress);
    expect(trade).toMatchObject({
      side: "sell",
      launchTokenAmount: 106470568539372674476982n,
      quoteAmount: 152481484790119429n,
      feeAsset: "quote_asset",
      logIndex: 58,
    });
  });

  it("finds no trade when the launch's pool has no Swap in the receipt", () => {
    const fixture = load("eth-pool-buy");
    const pool = poolOf(fixture);
    const hookLog = fixture.logs.find(
      (log) => lower(log.address) === lower(pool.contracts.hook),
    )!;
    const withoutSwaps = fixture.logs.filter(
      (log) => lower(log.address) !== lower(pool.contracts.poolManager),
    );

    expect(() => readPoolTrade(hookLog, { ...pool, receiptLogs: withoutSwaps })).toThrow(
      /no Swap/,
    );
  });

  it("ignores logs that are not the hook's HookFeeCollected", () => {
    const fixture = load("eth-pool-buy");
    const pool = poolOf(fixture);
    const others = fixture.logs.filter(
      (log) => lower(log.address) !== lower(pool.contracts.hook),
    );

    expect(others.length).toBeGreaterThan(0);
    for (const log of others) expect(readPoolTrade(log, pool)).toBeUndefined();
  });
});
