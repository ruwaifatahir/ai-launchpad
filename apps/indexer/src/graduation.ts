import { ponder } from "ponder:registry";
import { launch, pool } from "ponder:schema";

import { PonsV2MemeHookAbi } from "../abis/PonsV2MemeHookAbi";
import { deployment } from "./deployments";
import { updateMarketCap } from "./handler-context";
import { poolPriceAt } from "./market-cap";
import { zeroFeeWarning } from "./zero-fee-warning";

// The factory registers a launch's pool with the hook while seeding it, just before
// PoolGraduated in the same transaction. `memecoin` is the launch token.
ponder.on("MemeHook:PoolRegistered", async ({ event, context }) => {
  const { poolId, memecoin: token } = event.args;

  // Only the hook's factory can register a pool, and the owner can point the hook at
  // another factory. A pool whose token is not one of our launches is not ours: skip it
  // rather than halt indexing.
  const launchRow = await context.db.find(launch, { token });
  if (!launchRow) {
    console.warn(
      `Pool ${poolId} registered for ${token}, which is not a launch; skipped`,
    );
    return;
  }

  await context.db.insert(pool).values({ id: poolId, launch: token });
  await context.db.update(launch, { token }).set({ poolId });

  // A pool's fee terms are frozen when it registers, so reading them at the latest block
  // gives the same answer as at the event's, and works on a non-archive RPC.
  const terms = await context.client.readContract({
    abi: PonsV2MemeHookAbi,
    address: context.contracts.MemeHook.address,
    functionName: "launches",
    args: [poolId],
    cache: "immutable",
  });
  // launches() returns the hook's LaunchInfo struct as a tuple.
  const creatorTaxBps = terms[7];
  const hookFeeBps = terms[10];

  const warning = zeroFeeWarning({ poolId, launch: token, hookFeeBps, creatorTaxBps });
  if (warning) console.warn(warning);
});

// The second and last step of graduation: the pool is seeded and trading moves there.
ponder.on("LaunchFactory:PoolGraduated", async ({ event, context }) => {
  const { token } = event.args;

  const launchRow = await context.db.find(launch, { token });
  if (!launchRow) throw new Error(`PoolGraduated for unknown launch ${token}`);

  await context.db.update(launch, { token }).set({
    graduated: true,
    graduationBlock: event.block.number,
    graduationTimestamp: event.block.timestamp,
    graduationTransactionHash: event.transaction.hash,
  });

  // The market cap moves to the pool, at the price the factory initialized it with, just
  // before this event.
  const { poolId } = launchRow;
  if (!poolId)
    throw new Error(`PoolGraduated for ${token}, whose pool is not registered`);
  const receipt = await context.client.getTransactionReceipt({
    hash: event.transaction.hash,
  });
  const sqrtPriceX96 = poolPriceAt(event.log, {
    poolId,
    poolManager: deployment.poolManager,
    logs: receipt.logs,
  });
  if (sqrtPriceX96 === undefined) {
    throw new Error(
      `PoolGraduated for ${token} has no Initialize of pool ${poolId} before it`,
    );
  }
  await context.db.update(pool, { id: poolId }).set({ sqrtPriceX96 });
  await updateMarketCap(context, token);
});
