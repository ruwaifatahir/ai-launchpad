import {
  decodeEventLog,
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  pad,
  zeroAddress,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";

import { PonsV2MemeHookAbi } from "../abis/PonsV2MemeHookAbi";
import { PoolManagerAbi } from "../abis/PoolManagerAbi";
import { readHookTrades, readPoolTrade, type RawLog, type Trade } from "../src/trades";
import { fixtureNames, load, lower, price, transactionOf, type Fixture } from "./fixture";

const sweepFixtures = [
  "eth-sweep-buyback-and-fee-conversion",
  "stock-sweep-buyback-and-fee-conversion",
];

function poolOf(fixture: Fixture, logs: RawLog[] = fixture.logs) {
  const { poolId } = fixture.launch;
  if (!poolId || !fixture.hook || !fixture.poolManager) {
    throw new Error("Not a pool fixture");
  }
  return {
    chainId: fixture.chainId,
    contracts: { hook: fixture.hook, poolManager: fixture.poolManager },
    launch: { ...fixture.launch, poolId },
    receiptLogs: logs,
    transaction: transactionOf(fixture),
  };
}

// What the handler does: every hook log of the transaction goes through the reader, with
// the whole receipt. Ponder only calls it for PoolFeesSwept and PoolConversionSkipped;
// the reader returns nothing for the hook's other events.
function hookTrades(fixture: Fixture, logs: RawLog[] = fixture.logs): Trade[] {
  const pool = poolOf(fixture, logs);
  return logs
    .filter((log) => lower(log.address) === lower(pool.contracts.hook))
    .flatMap((log) => readHookTrades(log, pool));
}

function decodeSwap(log: RawLog) {
  const event = decodeEventLog({ abi: PoolManagerAbi, eventName: "Swap", ...log });
  return event.args;
}

// The receipt's PoolManager Swaps, by log index.
function swapLogs(fixture: Fixture): RawLog[] {
  return fixture.logs.filter((log) => {
    if (lower(log.address) !== lower(fixture.poolManager!)) return false;
    try {
      decodeSwap(log);
      return true;
    } catch {
      return false;
    }
  });
}

// The same Swap with other amounts, as a swap that filled nothing would log.
function withAmounts(log: RawLog, amount0: bigint, amount1: bigint): RawLog {
  const { sqrtPriceX96, liquidity, tick, fee } = decodeSwap(log);
  const swap = getAbiItem({ abi: PoolManagerAbi, name: "Swap" });
  return {
    ...log,
    data: encodeAbiParameters(
      swap.inputs.filter((input) => !input.indexed),
      [amount0, amount1, sqrtPriceX96, liquidity, tick, fee],
    ),
  };
}

function conversionSkipped(hook: Hex, poolId: Hex, logIndex: number): RawLog {
  return {
    address: hook,
    topics: encodeEventTopics({
      abi: PonsV2MemeHookAbi,
      eventName: "PoolConversionSkipped",
      args: { poolId },
    }) as [Hex, ...Hex[]],
    data: encodeAbiParameters([{ type: "uint256" }], [1n]),
    logIndex,
  };
}

describe("every sweep fixture matches Pons's trades API", () => {
  it.each(sweepFixtures)("%s", (name) => {
    const fixture = load(name);
    const trades = hookTrades(fixture);

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

describe("buybacks and fee conversions", () => {
  it("labels a real sweep's fee conversion and buyback", () => {
    const fixture = load("eth-sweep-buyback-and-fee-conversion");
    const trades = hookTrades(fixture);

    expect(fixture.launch.quoteAsset).toBe(zeroAddress);
    expect(trades).toEqual([
      expect.objectContaining({
        venue: "pool",
        kind: "fee_conversion",
        side: "sell",
        launchTokenAmount: 5721228455355742098768n,
        quoteAmount: 5864137213827601n,
        fee: 0n,
        creatorTax: 0n,
        logIndex: 41,
      }),
      expect.objectContaining({
        venue: "pool",
        kind: "buyback",
        side: "buy",
        launchTokenAmount: 2673436605142352525441n,
        quoteAmount: 2739926733110570n,
        fee: 0n,
        creatorTax: 0n,
        logIndex: 43,
      }),
    ]);
  });

  it("labels them when the launch token is the pool's currency0", () => {
    const fixture = load("stock-sweep-buyback-and-fee-conversion");

    // Quoted in a stock token whose address sorts above the launch token's.
    expect(BigInt(fixture.launch.token)).toBeLessThan(BigInt(fixture.launch.quoteAsset));
    expect(hookTrades(fixture).map((t) => [t.logIndex, t.kind, t.side])).toEqual([
      [31, "fee_conversion", "sell"],
      [35, "buyback", "buy"],
    ]);
  });

  it("takes the trader from the signer, not the hook", () => {
    for (const name of sweepFixtures) {
      const fixture = load(name);
      for (const trade of hookTrades(fixture)) {
        expect(lower(trade.trader)).toBe(lower(fixture.transaction.from));
        // Pons shows the hook.
        expect(lower(trade.trader)).not.toBe(lower(fixture.hook!));
      }
      expect(fixture.pons.map((pons) => pons.account)).toEqual([
        lower(fixture.hook!),
        lower(fixture.hook!),
      ]);
    }
  });

  it("records nothing for a conversion that filled nothing", () => {
    const fixture = load("eth-sweep-buyback-and-fee-conversion");
    const [conversion, buyback] = swapLogs(fixture);
    // The zero-fill conversion, then its PoolConversionSkipped in place of the transfer
    // a filled one makes, then the buyback and the sweep's PoolFeesSwept.
    const logs = fixture.logs.map((log) => {
      if (log.logIndex === conversion!.logIndex) return withAmounts(log, 0n, 0n);
      if (log.logIndex === conversion!.logIndex + 1) {
        return conversionSkipped(fixture.hook!, fixture.launch.poolId!, log.logIndex);
      }
      return log;
    });

    const trades = hookTrades(fixture, logs);

    expect(trades.map((t) => [t.logIndex, t.kind])).toEqual([
      [buyback!.logIndex, "buyback"],
    ]);
  });

  it("records each swap once when one transaction emits both triggers", () => {
    const fixture = load("eth-sweep-buyback-and-fee-conversion");
    const [conversion] = swapLogs(fixture);
    // A PoolConversionSkipped between the two swaps, beside the real PoolFeesSwept.
    const logs = fixture.logs.map((log) =>
      log.logIndex === conversion!.logIndex + 1
        ? conversionSkipped(fixture.hook!, fixture.launch.poolId!, log.logIndex)
        : log,
    );

    const trades = hookTrades(fixture, logs);

    expect(trades.map((t) => [t.logIndex, t.kind])).toEqual([
      [41, "fee_conversion"],
      [43, "buyback"],
    ]);
  });

  it("ignores Swaps whose sender is not the hook: those are user trades", () => {
    const fixture = load("eth-sweep-buyback-and-fee-conversion");
    const [conversion] = swapLogs(fixture);
    const router = "0x8876789976decbfcbbbe364623c63652db8c0904";
    const logs = fixture.logs.map((log) =>
      log.logIndex === conversion!.logIndex
        ? {
            ...log,
            topics: [log.topics[0]!, log.topics[1]!, pad(router)] as [Hex, ...Hex[]],
          }
        : log,
    );

    expect(hookTrades(fixture, logs).map((t) => t.kind)).toEqual(["buyback"]);
  });

  it("finds no hook trades in user pool trades, and no user trades in a sweep", () => {
    const userFixtures = fixtureNames().filter(
      (name) => load(name).launch.poolId && !sweepFixtures.includes(name),
    );
    expect(userFixtures.length).toBeGreaterThan(0);
    for (const name of userFixtures) expect(hookTrades(load(name))).toEqual([]);

    for (const name of sweepFixtures) {
      const fixture = load(name);
      const pool = poolOf(fixture);
      for (const log of fixture.logs) expect(readPoolTrade(log, pool)).toBeUndefined();
    }
  });

  it("ignores a trigger of another pool", () => {
    const fixture = load("eth-sweep-buyback-and-fee-conversion");
    const pool = poolOf(fixture);
    const otherPool = { ...pool, launch: { ...pool.launch, poolId: pad("0x1") } };

    for (const log of fixture.logs) expect(readHookTrades(log, otherPool)).toEqual([]);
  });
});
