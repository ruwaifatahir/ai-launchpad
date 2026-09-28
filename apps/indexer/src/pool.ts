import { ponder, type Context, type IndexingFunctionArgs } from "ponder:registry";
import { pool, trade } from "ponder:schema";

import { deployment } from "./deployments";
import {
  findPoolLaunch,
  recordUserTrade,
  transactionOf,
  updateMarketCap,
} from "./handler-context";
import { poolPriceAt } from "./market-cap";
import {
  readHookTrades,
  readPoolTrade,
  type PoolTradeInput,
  type RawLog,
} from "./trades";

type PoolEvent = IndexingFunctionArgs<
  | "MemeHook:HookFeeCollected"
  | "MemeHook:PoolFeesSwept"
  | "MemeHook:PoolConversionSkipped"
>["event"];

// What both pool readers take: the launch, and the transaction's whole receipt. Undefined
// for a pool that is not ours.
async function poolTradeInput(
  event: PoolEvent,
  context: Context,
): Promise<PoolTradeInput | undefined> {
  const { poolId } = event.args;
  const launchRow = await findPoolLaunch(context, poolId);
  if (!launchRow) return undefined;

  // Fetched by transaction hash, so Ponder caches it: a transaction that trades in our
  // pools several times fetches it once.
  const receipt = await context.client.getTransactionReceipt({
    hash: event.transaction.hash,
  });

  return {
    chainId: context.chain.id,
    contracts: {
      hook: context.contracts.MemeHook.address,
      poolManager: deployment.poolManager,
    },
    launch: { token: launchRow.token, quoteAsset: launchRow.quoteAsset, poolId },
    receiptLogs: receipt.logs,
    transaction: transactionOf(event),
  };
}

// Moves the pool's price to where the swaps before this log left it, and the market cap
// with it.
async function movePoolPrice(context: Context, log: RawLog, input: PoolTradeInput) {
  const { poolId, token } = input.launch;
  const sqrtPriceX96 = poolPriceAt(log, {
    poolId,
    poolManager: input.contracts.poolManager,
    logs: input.receiptLogs,
  });
  if (sqrtPriceX96 === undefined) return;
  await context.db.update(pool, { id: poolId }).set({ sqrtPriceX96 });
  await updateMarketCap(context, token);
}

// Every user trade in one of our pools, after graduation. The hook emits HookFeeCollected
// on each; the trade itself is Uniswap's Swap, read from the transaction's receipt. The
// PoolManager is not a source, since it logs every swap on the chain.
ponder.on("MemeHook:HookFeeCollected", async ({ event, context }) => {
  const input = await poolTradeInput(event, context);
  if (!input) return;

  const poolTrade = readPoolTrade(event.log, input);
  if (!poolTrade) throw new Error(`${event.id} is not a pool trade`);

  await context.db.insert(trade).values(poolTrade);
  await recordUserTrade(context, poolTrade);
  await movePoolPrice(context, event.log, input);
});

// The hook's own swaps: its buybacks and fee conversions, made while sweeping a pool's
// fees. Every sweep that swaps emits one of these two after its swaps; the trades are the
// hook's Swaps read from the receipt. Each event takes only the swaps since
// the previous one of its pool, so a transaction with both records each swap once.
async function recordHookTrades({
  event,
  context,
}: IndexingFunctionArgs<"MemeHook:PoolFeesSwept" | "MemeHook:PoolConversionSkipped">) {
  const input = await poolTradeInput(event, context);
  if (!input) return;

  const hookTrades = readHookTrades(event.log, input);
  if (hookTrades.length > 0) await context.db.insert(trade).values(hookTrades);
  await movePoolPrice(context, event.log, input);
}

ponder.on("MemeHook:PoolFeesSwept", recordHookTrades);
ponder.on("MemeHook:PoolConversionSkipped", recordHookTrades);
