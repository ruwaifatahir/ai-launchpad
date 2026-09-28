// Market cap reading. Logs go in, reserves, prices and market caps come out. Nothing here
// touches Ponder, the database or the network, so it is tested against a recorded Pons
// mainnet curve's whole history and a testnet graduation (test/market-cap.test.ts).
//
// Everything is followed from events, never read from the chain: the public RPC keeps only
// a few minutes of state, so a read at an old block fails during backfill.
import { decodeEventLog, isAddressEqual, type Address, type Hex } from "viem";

import { PonsV2BondingCurveAbi } from "../abis/PonsV2BondingCurveAbi";
import { PoolManagerAbi } from "../abis/PoolManagerAbi";
import { samePoolId, type RawLog } from "./trades";

// A bonding curve's reserves, as its realQuoteReserve() and getReserves() report them.
export type CurveReserves = {
  // The quote the curve holds for trading, its fees and creator tax left out: the
  // curve's realQuoteReserve(). Graduation progress is this over the threshold.
  quoteReserve: bigint;
  // The launch tokens the curve holds for trading.
  tokenReserve: bigint;
};

/**
 * The curve's reserves after one of its logs, by the curve's own accounting
 * (PonsV2BondingCurve's buy, sell and _sweepFees). A log that does not move them leaves
 * them as they are.
 *
 * - A buy adds what the trader paid less the fee and creator tax, which wait apart until
 *   swept, and takes the tokens out.
 * - A sell takes out what the trader received and the fee and creator tax, and puts the
 *   tokens back.
 * - A fee sweep pays out everything but its buyback slice, which stays in the reserve and
 *   buys launch tokens off the curve for the buyback vault: BuybackLocked. A sweep with no
 *   buyback, or a fee rescue, pays out exactly what waited apart, so it moves nothing.
 */
export function curveReservesAfter(reserves: CurveReserves, log: RawLog): CurveReserves {
  const event = decodeCurveEvent(log);
  switch (event?.eventName) {
    case "CurveBuy": {
      const { quoteIn, tokensOut, fee, tax } = event.args;
      return {
        quoteReserve: reserves.quoteReserve + quoteIn - fee - tax,
        tokenReserve: reserves.tokenReserve - tokensOut,
      };
    }
    case "CurveSell": {
      const { tokensIn, quoteOut, fee, tax } = event.args;
      return {
        quoteReserve: reserves.quoteReserve - quoteOut - fee - tax,
        tokenReserve: reserves.tokenReserve + tokensIn,
      };
    }
    case "BuybackLocked": {
      const { quoteSpent, tokensLocked } = event.args;
      return {
        quoteReserve: reserves.quoteReserve + quoteSpent,
        tokenReserve: reserves.tokenReserve - tokensLocked,
      };
    }
    default:
      return reserves;
  }
}

/**
 * A curve launch's market cap, in the quote asset's raw units: its current price times
 * its supply. The curve prices with a constant product over its reserves plus its phantom
 * quote, so the current price is (phantomQuote + quoteReserve) / tokenReserve. With no
 * trade yet the curve holds the whole supply, and the market cap is the phantom quote.
 */
export function curveMarketCap(
  curve: CurveReserves & { phantomQuote: bigint },
  supply: bigint,
): bigint {
  return ((curve.phantomQuote + curve.quoteReserve) * supply) / curve.tokenReserve;
}

/**
 * A pool launch's market cap, in the quote asset's raw units: its current price times its
 * supply. Uniswap's sqrtPriceX96 squared, over 2^192, is currency1 per currency0.
 */
export function poolMarketCap(
  {
    sqrtPriceX96,
    launchTokenIsCurrency0,
  }: { sqrtPriceX96: bigint; launchTokenIsCurrency0: boolean },
  supply: bigint,
): bigint {
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  return launchTokenIsCurrency0
    ? (supply * priceX192) >> 192n
    : (supply << 192n) / priceX192;
}

/**
 * The pool's current price as of a log: the sqrtPriceX96 of its latest Swap or its
 * Initialize before that log, in the transaction's receipt. Undefined when there is none.
 *
 * A Swap's price is the pool's after the swap. Graduation initializes the pool at the
 * curve's last price, before its PoolGraduated; each trade's hook event comes right after
 * its Swap.
 */
export function poolPriceAt(
  log: RawLog,
  { poolId, poolManager, logs }: { poolId: Hex; poolManager: Address; logs: RawLog[] },
): bigint | undefined {
  return logs
    .filter(
      (candidate) =>
        candidate.logIndex < log.logIndex &&
        isAddressEqual(candidate.address, poolManager),
    )
    .sort((a, b) => b.logIndex - a.logIndex)
    .map(decodePoolPrice)
    .find((price) => price && samePoolId(price.poolId, poolId))?.sqrtPriceX96;
}

function decodePoolPrice(log: RawLog) {
  try {
    const event = decodeEventLog({
      abi: PoolManagerAbi,
      topics: log.topics,
      data: log.data,
    });
    if (event.eventName !== "Swap" && event.eventName !== "Initialize") return undefined;
    return { poolId: event.args.id, sqrtPriceX96: event.args.sqrtPriceX96 };
  } catch {
    return undefined;
  }
}

function decodeCurveEvent(log: RawLog) {
  try {
    return decodeEventLog({
      abi: PonsV2BondingCurveAbi,
      topics: log.topics,
      data: log.data,
    });
  } catch {
    return undefined;
  }
}
