import { ponder } from "ponder:registry";
import { curve as curveTable, holder, launch } from "ponder:schema";
import { erc20Abi, isAddressEqual, parseEventLogs, zeroAddress } from "viem";

import { PonsV2BondingCurveAbi } from "../abis/PonsV2BondingCurveAbi";
import { PonsV2LauncherTokenAbi } from "../abis/PonsV2LauncherTokenAbi";
import { curveMarketCap } from "./market-cap";
import { readQuoteAsset } from "./quote-asset";
import { socialsFrom } from "./socials";
import { noTrades } from "./volume";

ponder.on("LaunchFactory:TokenLaunched", async ({ event, context }) => {
  const {
    token,
    curve,
    deployer: creator,
    pairToken: quoteAsset,
    launchConfigId,
    graduationThreshold,
  } = event.args;

  // These reads are at the latest block, not the event's: the public RPC keeps only a few
  // minutes of state, so a read at an old block fails during backfill. That is safe
  // because the launch token has no setters and the curve's creator tax and phantom quote
  // are immutable.
  // `cache: "immutable"` is what makes Ponder read at the latest block, and it caches the
  // answer. The quote asset is read the same way, in readQuoteAsset.
  const curveRead = {
    abi: PonsV2BondingCurveAbi,
    address: curve,
    cache: "immutable",
  } as const;
  const tokenRead = {
    abi: PonsV2LauncherTokenAbi,
    address: token,
    cache: "immutable",
  } as const;

  const [
    name,
    symbol,
    logo,
    description,
    socials,
    creatorTaxBps,
    phantomQuote,
    quoteAssetInfo,
    receipt,
  ] = await Promise.all([
    context.client.readContract({ ...tokenRead, functionName: "name" }),
    context.client.readContract({ ...tokenRead, functionName: "symbol" }),
    context.client.readContract({ ...tokenRead, functionName: "logo" }),
    context.client.readContract({ ...tokenRead, functionName: "description" }),
    context.client.readContract({ ...tokenRead, functionName: "socials" }),
    context.client.readContract({ ...curveRead, functionName: "creatorTaxBps" }),
    context.client.readContract({ ...curveRead, functionName: "phantomQuote" }),
    readQuoteAsset(context.client, quoteAsset),
    context.client.getTransactionReceipt({ hash: event.transaction.hash }),
  ]);

  // Total supply is not read like the rest: holders can burn, so the latest supply may
  // already be lower than at launch. The whole supply is minted in the token's
  // constructor, in this transaction, so it is the sum of the token's mints here.
  const mints = parseEventLogs({
    abi: erc20Abi,
    eventName: "Transfer",
    logs: receipt.logs,
    args: { from: zeroAddress },
  }).filter((log) => isAddressEqual(log.address, token));
  if (mints.length === 0) {
    throw new Error(`No mint of launch token ${token} in ${event.transaction.hash}`);
  }
  const totalSupply = mints.reduce((sum, log) => sum + log.args.value, 0n);

  // The curve's opening reserves: no quote yet, and every token minted to it, which is the
  // whole supply. The curve's initialize() takes its token reserve the same way, as its
  // balance.
  const opening = {
    quoteReserve: 0n,
    tokenReserve: mints
      .filter((log) => isAddressEqual(log.args.to, curve))
      .reduce((sum, log) => sum + log.args.value, 0n),
  };

  await context.db.insert(launch).values({
    token,
    chainId: context.chain.id,
    curve,
    creator,
    quoteAsset,
    quoteAssetSymbol: quoteAssetInfo.symbol,
    quoteAssetDecimals: quoteAssetInfo.decimals,
    launchConfigId,
    graduationThreshold,
    name,
    symbol,
    logo,
    description,
    ...socialsFrom(socials),
    // At most the factory's maxCreatorTaxBps, far below 2^53.
    creatorTaxBps: Number(creatorTaxBps),
    totalSupply,
    // Nothing is burned yet. Burns lower it, in the Transfer handler.
    supply: totalSupply,
    // With no trade yet, the price is the curve's opening price.
    marketCap: curveMarketCap({ phantomQuote, ...opening }, totalSupply),
    curveQuoteReserve: opening.quoteReserve,
    ...noTrades,
    launchBlock: event.block.number,
    launchTimestamp: event.block.timestamp,
    launchTransactionHash: event.transaction.hash,
    // PoolGraduated sets it, with the graduation block, time and transaction.
    graduated: false,
  });

  // Curve events carry no token; this is how a curve trade finds its launch.
  await context.db.insert(curveTable).values({
    address: curve,
    launch: token,
    phantomQuote,
    tokenReserve: opening.tokenReserve,
  });

  // The curve is a protocol holder. Its holder row usually exists already: the token's
  // mint to the curve comes earlier in this transaction, before this launch row, so the
  // Transfer handler could not tell it was the curve.
  await context.db
    .insert(holder)
    .values({ launch: token, wallet: curve, balance: 0n, isProtocol: true })
    .onConflictDoUpdate({ isProtocol: true });
});
