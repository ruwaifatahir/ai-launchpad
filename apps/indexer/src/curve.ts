import { ponder, type Context, type IndexingFunctionArgs } from "ponder:registry";
import { curve, launch, trade } from "ponder:schema";
import type { Address } from "viem";

import { recordUserTrade, transactionOf, updateMarketCap } from "./handler-context";
import { curveReservesAfter } from "./market-cap";
import { readCurveTrade, type RawLog } from "./trades";

// The curve's row and its launch's. Written by the TokenLaunched handler, which runs
// first: the factory creates the curve before anyone can trade on it.
async function curveLaunch(context: Context, curveAddress: Address) {
  const curveRow = await context.db.find(curve, { address: curveAddress });
  if (!curveRow) throw new Error(`Curve ${curveAddress} has no launch`);
  const launchRow = await context.db.find(launch, { token: curveRow.launch });
  if (!launchRow) throw new Error(`Curve ${curveAddress} maps to unknown launch`);
  return { curveRow, launchRow };
}

// Moves the curve's reserves by one of its logs, and the market cap with them.
async function moveReserves(context: Context, log: RawLog) {
  const { curveRow, launchRow } = await curveLaunch(context, log.address);
  const { quoteReserve, tokenReserve } = curveReservesAfter(
    { quoteReserve: launchRow.curveQuoteReserve, tokenReserve: curveRow.tokenReserve },
    log,
  );
  await context.db.update(curve, { address: curveRow.address }).set({ tokenReserve });
  await context.db
    .update(launch, { token: launchRow.token })
    .set({ curveQuoteReserve: quoteReserve });
  await updateMarketCap(context, launchRow.token);
}

// Every buy and sell on a bonding curve becomes a trade under its launch.
async function recordCurveTrade({
  event,
  context,
}: IndexingFunctionArgs<"BondingCurve:CurveBuy" | "BondingCurve:CurveSell">) {
  const curveAddress = event.log.address;
  const { launchRow } = await curveLaunch(context, curveAddress);

  const curveTrade = readCurveTrade(event.log, {
    chainId: context.chain.id,
    launch: { token: launchRow.token, curve: curveAddress },
    transaction: transactionOf(event),
  });
  if (!curveTrade) throw new Error(`${event.id} is not a curve trade`);

  await context.db.insert(trade).values(curveTrade);
  await recordUserTrade(context, curveTrade);
  await moveReserves(context, event.log);
}

ponder.on("BondingCurve:CurveBuy", recordCurveTrade);
ponder.on("BondingCurve:CurveSell", recordCurveTrade);

// A fee sweep's buyback buys launch tokens off the curve's own reserve. It is not a
// trade, as on Pons, but it moves the curve's price and graduation progress.
ponder.on("BondingCurve:BuybackLocked", async ({ event, context }) => {
  await moveReserves(context, event.log);
});
