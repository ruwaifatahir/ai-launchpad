// Trade reading. A transaction's logs and its signer go in, trades come out. Nothing here
// touches Ponder, the database or the network, so it is tested against recorded Pons
// mainnet transactions (test/fixtures). Handlers only pass their inputs and store the
// output.
import { decodeEventLog, isAddressEqual, type Address, type Hash, type Hex } from "viem";

import { PonsV2BondingCurveAbi } from "../abis/PonsV2BondingCurveAbi";
import { PonsV2MemeHookAbi } from "../abis/PonsV2MemeHookAbi";
import { PoolManagerAbi } from "../abis/PoolManagerAbi";

export type Trade = {
  // chainId:block:transactionHash:logIndex, the same form as Pons's trade ids.
  id: string;
  chainId: number;
  // The launch token.
  launch: Address;
  venue: "curve" | "pool";
  kind: "user" | "buyback" | "fee_conversion";
  side: "buy" | "sell";
  // Always the transaction's signer, whichever contract it went through.
  trader: Address;
  // Raw units of the launch token (18 decimals).
  launchTokenAmount: bigint;
  // Raw units of the quote asset. What the trader paid on a buy, what they received on a
  // sell: see readCurveTrade. In the pool, the Swap's amount, see readPoolTrade.
  quoteAmount: bigint;
  // Raw units of feeAsset. On the curve the fee includes any snipe tax.
  fee: bigint;
  creatorTax: bigint;
  // What the fee and creator tax are paid in. Always the quote asset on the curve. In the
  // pool the hook takes them from the side the trader did not fix, so an exact-input buy
  // pays them in the launch token.
  feeAsset: "quote_asset" | "launch_token";
  blockNumber: bigint;
  timestamp: bigint;
  transactionHash: Hash;
  logIndex: number;
};

export type RawLog = {
  address: Address;
  topics: [Hex, ...Hex[]] | [];
  data: Hex;
  logIndex: number;
};

export type TransactionContext = {
  hash: Hash;
  signer: Address;
  blockNumber: bigint;
  timestamp: bigint;
};

// What readPoolTrade and readHookTrades take besides the log.
export type PoolTradeInput = {
  chainId: number;
  contracts: { hook: Address; poolManager: Address };
  launch: { token: Address; quoteAsset: Address; poolId: Hex };
  // Every log of the transaction's receipt.
  receiptLogs: RawLog[];
  transaction: TransactionContext;
};

/**
 * Reads one curve trade from a log of the launch's bonding curve, or returns undefined if
 * the log is not a `CurveBuy` or `CurveSell` of that curve.
 *
 * The quote amount is as the curve emits it: on a buy, `quoteIn`, what the trader paid,
 * fee and creator tax included; on a sell, `quoteOut`, what the trader received, after
 * them. That is what the trader paid divided by what they received, and it is the only
 * choice that reproduces Pons's chart prices (checked against three recorded mainnet
 * trades; the other way round is about 2.3% off, see test/curve-trades.test.ts).
 *
 * The fee is the event's `fee`, which on a buy includes any snipe tax.
 */
export function readCurveTrade(
  log: RawLog,
  {
    chainId,
    launch,
    transaction,
  }: {
    chainId: number;
    launch: { token: Address; curve: Address };
    transaction: TransactionContext;
  },
): Trade | undefined {
  if (!isAddressEqual(log.address, launch.curve)) return undefined;

  let event;
  try {
    event = decodeEventLog({
      abi: PonsV2BondingCurveAbi,
      topics: log.topics,
      data: log.data,
    });
  } catch {
    // A log the curve ABI does not know.
    return undefined;
  }

  const common = {
    id: tradeId(chainId, transaction, log.logIndex),
    chainId,
    launch: launch.token,
    venue: "curve",
    kind: "user",
    trader: transaction.signer,
    blockNumber: transaction.blockNumber,
    timestamp: transaction.timestamp,
    transactionHash: transaction.hash,
    logIndex: log.logIndex,
  } as const;

  switch (event.eventName) {
    case "CurveBuy":
      return {
        ...common,
        side: "buy",
        launchTokenAmount: event.args.tokensOut,
        quoteAmount: event.args.quoteIn,
        fee: event.args.fee,
        creatorTax: event.args.tax,
        feeAsset: "quote_asset",
      };
    case "CurveSell":
      return {
        ...common,
        side: "sell",
        launchTokenAmount: event.args.tokensIn,
        quoteAmount: event.args.quoteOut,
        fee: event.args.fee,
        creatorTax: event.args.tax,
        feeAsset: "quote_asset",
      };
    default:
      return undefined;
  }
}

/**
 * Reads one pool trade from a `HookFeeCollected` of the hook, or returns undefined if the
 * log is not a `HookFeeCollected` of that hook for the launch's pool. The PoolManager
 * logs every swap on the chain, so it is not indexed; its `Swap` is read from the receipt.
 *
 * The hook emits `HookFeeCollected` in its afterSwap, which Uniswap calls right after
 * emitting the swap's `Swap`. So the trade is the PoolManager `Swap` of the same pool
 * just before the hook event, in log order: a transaction that swaps in the pool several
 * times pairs each hook event with its own swap, and swaps in other pools are passed over.
 *
 * Side and amounts come from the launch token's side of the pool, by Uniswap's sign rule:
 * negative is what the trader paid in, positive what they received. The amounts are the
 * Swap's, before the hook's cut, which is what Pons's trades API shows. The trade's log
 * index is the Swap's, as in Pons's trade ids. The fee and creator tax are the hook
 * event's, in whichever asset it took them.
 */
export function readPoolTrade(
  hookLog: RawLog,
  { chainId, contracts, launch, receiptLogs, transaction }: PoolTradeInput,
): Trade | undefined {
  if (!isAddressEqual(hookLog.address, contracts.hook)) return undefined;

  // viem's decodeEventLog does not hold a log to its eventName option: it decodes any
  // event of the ABI. So the name is checked here.
  const feeCollected = decodeHookEvent(hookLog);
  if (feeCollected?.eventName !== "HookFeeCollected") return undefined;
  if (!samePoolId(feeCollected.args.poolId, launch.poolId)) return undefined;

  const swap = receiptLogs
    .filter(
      (log) =>
        log.logIndex < hookLog.logIndex &&
        isAddressEqual(log.address, contracts.poolManager),
    )
    .sort((a, b) => b.logIndex - a.logIndex)
    .map((log) => ({ log, event: decodeSwap(log) }))
    .find(({ event }) => event && samePoolId(event.args.id, launch.poolId));
  if (!swap?.event) {
    throw new Error(
      `HookFeeCollected at log ${hookLog.logIndex} of ${transaction.hash} has no Swap of pool ${launch.poolId} before it`,
    );
  }

  const { tokenDelta, quoteDelta } = launchSide(swap.event.args, launch);

  return {
    id: tradeId(chainId, transaction, swap.log.logIndex),
    chainId,
    launch: launch.token,
    venue: "pool",
    kind: "user",
    // The trader received the launch token: a buy.
    side: tokenDelta > 0n ? "buy" : "sell",
    trader: transaction.signer,
    launchTokenAmount: abs(tokenDelta),
    quoteAmount: abs(quoteDelta),
    fee: feeCollected.args.feeAmount,
    creatorTax: feeCollected.args.taxAmount,
    feeAsset: isAddressEqual(feeCollected.args.currency, launch.token)
      ? "launch_token"
      : "quote_asset",
    blockNumber: transaction.blockNumber,
    timestamp: transaction.timestamp,
    transactionHash: transaction.hash,
    logIndex: swap.log.logIndex,
  };
}

/**
 * Reads the hook's own swaps that come with a `PoolFeesSwept` or `PoolConversionSkipped`
 * of the hook for the launch's pool, or returns no trades if the log is neither.
 *
 * Every sweep that swaps emits one of these after it: `PoolConversionSkipped` when its
 * conversion filled nothing, and `PoolFeesSwept` when it distributes, which a sweep with
 * nothing left to distribute after a skipped conversion does not.
 *
 * A sweep swaps in the pool itself, before its event: first a fee conversion, selling the
 * launch tokens the hook collected as fees for the quote asset, then a buyback, buying
 * the launch token with the quote asset. Its trades are the PoolManager `Swap`s of the
 * same pool whose sender is the hook, between the previous such event of that pool in the
 * transaction and this one. So a transaction with several of these events, such as a
 * skipped conversion followed by its sweep's `PoolFeesSwept`, records each swap once.
 * Swaps of other senders are user trades, read from `HookFeeCollected` (readPoolTrade).
 *
 * Buying the launch token is a buyback, selling it a fee conversion, by Uniswap's sign
 * rule as for a user trade. A swap that moved nothing (a conversion that filled nothing)
 * is not a trade, and neither is one that moved only one side, which has no price. The
 * hook takes no fee on its own swaps (Uniswap skips a pool's hooks when the hook itself
 * swaps), so fee and creator tax are 0. The trader is the transaction's signer, the
 * sweep operator.
 */
export function readHookTrades(
  triggerLog: RawLog,
  { chainId, contracts, launch, receiptLogs, transaction }: PoolTradeInput,
): Trade[] {
  const isTrigger = (log: RawLog) => {
    if (!isAddressEqual(log.address, contracts.hook)) return false;
    const event = decodeHookEvent(log);
    return (
      (event?.eventName === "PoolFeesSwept" ||
        event?.eventName === "PoolConversionSkipped") &&
      samePoolId(event.args.poolId, launch.poolId)
    );
  };
  if (!isTrigger(triggerLog)) return [];

  const previousTrigger = Math.max(
    -1,
    ...receiptLogs
      .filter((log) => log.logIndex < triggerLog.logIndex && isTrigger(log))
      .map((log) => log.logIndex),
  );

  return receiptLogs
    .filter(
      (log) =>
        log.logIndex > previousTrigger &&
        log.logIndex < triggerLog.logIndex &&
        isAddressEqual(log.address, contracts.poolManager),
    )
    .sort((a, b) => a.logIndex - b.logIndex)
    .flatMap((log) => {
      const swap = decodeSwap(log);
      if (
        !swap ||
        !samePoolId(swap.args.id, launch.poolId) ||
        !isAddressEqual(swap.args.sender, contracts.hook)
      ) {
        return [];
      }
      const { tokenDelta, quoteDelta } = launchSide(swap.args, launch);
      if (tokenDelta === 0n || quoteDelta === 0n) return [];

      const bought = tokenDelta > 0n;
      return [
        {
          id: tradeId(chainId, transaction, log.logIndex),
          chainId,
          launch: launch.token,
          venue: "pool",
          kind: bought ? "buyback" : "fee_conversion",
          side: bought ? "buy" : "sell",
          trader: transaction.signer,
          launchTokenAmount: abs(tokenDelta),
          quoteAmount: abs(quoteDelta),
          fee: 0n,
          creatorTax: 0n,
          feeAsset: "quote_asset",
          blockNumber: transaction.blockNumber,
          timestamp: transaction.timestamp,
          transactionHash: transaction.hash,
          logIndex: log.logIndex,
        } satisfies Trade,
      ];
    });
}

// Uniswap sorts a pool's two currencies by address; native ETH is the zero address, so
// always currency0.
export function launchTokenIsCurrency0(launch: {
  token: Address;
  quoteAsset: Address;
}): boolean {
  return BigInt(launch.token) < BigInt(launch.quoteAsset);
}

// The launch token's and the quote asset's side of a Swap, as the swapper saw them:
// negative is what they paid in, positive what they received.
function launchSide(
  { amount0, amount1 }: { amount0: bigint; amount1: bigint },
  launch: { token: Address; quoteAsset: Address },
): { tokenDelta: bigint; quoteDelta: bigint } {
  return launchTokenIsCurrency0(launch)
    ? { tokenDelta: amount0, quoteDelta: amount1 }
    : { tokenDelta: amount1, quoteDelta: amount0 };
}

function decodeHookEvent(log: RawLog) {
  try {
    return decodeEventLog({ abi: PonsV2MemeHookAbi, topics: log.topics, data: log.data });
  } catch {
    return undefined;
  }
}

export function samePoolId(a: Hex, b: Hex): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// chainId:block:transactionHash:logIndex, the same form as Pons's trade ids.
function tradeId(
  chainId: number,
  transaction: TransactionContext,
  logIndex: number,
): string {
  return `${chainId}:${transaction.blockNumber}:${transaction.hash}:${logIndex}`;
}

function decodeSwap(log: RawLog) {
  try {
    const event = decodeEventLog({
      abi: PoolManagerAbi,
      topics: log.topics,
      data: log.data,
    });
    return event.eventName === "Swap" ? event : undefined;
  } catch {
    return undefined;
  }
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}
