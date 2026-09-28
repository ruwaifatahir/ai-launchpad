import type { Context } from "ponder:registry";
import { curve, launch, launchHour, pool } from "ponder:schema";
import type { Address, Hash, Hex } from "viem";

import { curveMarketCap, poolMarketCap } from "./market-cap";
import { launchTokenIsCurrency0, type Trade, type TransactionContext } from "./trades";
import { hourOf, noTrades, withTrade } from "./volume";

// The part of a Ponder event the trade readers need about its transaction.
export function transactionOf(event: {
  transaction: { hash: Hash; from: Address };
  block: { number: bigint; timestamp: bigint };
}): TransactionContext {
  return {
    hash: event.transaction.hash,
    signer: event.transaction.from,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  };
}

// The launch of one of our pools, or undefined for a pool that is not ours. Pool rows are
// written from PoolRegistered, which comes before any trade in the pool; a pool the hook
// registered for a token that is not one of our launches has no row, and was warned about
// then.
export async function findPoolLaunch(context: Context, poolId: Hex) {
  const poolRow = await context.db.find(pool, { id: poolId });
  if (!poolRow) return undefined;
  const launchRow = await context.db.find(launch, { token: poolRow.launch });
  if (!launchRow)
    throw new Error(`Pool ${poolId} maps to unknown launch ${poolRow.launch}`);
  return launchRow;
}

// Counts a user trade, on the curve or in the pool, into its launch's volume, all time and
// in its hour. A buy is also the launch's latest. The hook's buybacks and fee conversions
// are not user trades and are not counted.
export async function recordUserTrade(context: Context, userTrade: Trade) {
  if (userTrade.kind !== "user") throw new Error(`${userTrade.id} is not a user trade`);
  await context.db.update(launch, { token: userTrade.launch }).set((row) => ({
    ...withTrade(row, userTrade),
    ...(userTrade.side === "buy" && { lastBuyTimestamp: userTrade.timestamp }),
  }));
  await context.db
    .insert(launchHour)
    .values({
      launch: userTrade.launch,
      hour: hourOf(userTrade.timestamp),
      ...withTrade(noTrades, userTrade),
    })
    .onConflictDoUpdate((row) => withTrade(row, userTrade));
}

// Sets a launch's market cap from its current price and supply, after either moved. The
// price is the pool's once graduation has set it, the curve's until then: between the
// curve closing and the pool opening, the curve's last price stands.
export async function updateMarketCap(context: Context, token: Address) {
  const launchRow = await context.db.find(launch, { token });
  if (!launchRow) throw new Error(`No launch ${token} to update the market cap of`);

  const poolRow = launchRow.poolId
    ? await context.db.find(pool, { id: launchRow.poolId })
    : null;

  let marketCap: bigint;
  if (poolRow?.sqrtPriceX96) {
    marketCap = poolMarketCap(
      {
        sqrtPriceX96: poolRow.sqrtPriceX96,
        launchTokenIsCurrency0: launchTokenIsCurrency0(launchRow),
      },
      launchRow.supply,
    );
  } else {
    const curveRow = await context.db.find(curve, { address: launchRow.curve });
    if (!curveRow) throw new Error(`Launch ${token} has no curve row`);
    marketCap = curveMarketCap(
      {
        phantomQuote: curveRow.phantomQuote,
        quoteReserve: launchRow.curveQuoteReserve,
        tokenReserve: curveRow.tokenReserve,
      },
      launchRow.supply,
    );
  }

  await context.db.update(launch, { token }).set({ marketCap });
}
