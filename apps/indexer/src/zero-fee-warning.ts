import type { Address, Hex } from "viem";

// A pool of ours whose hook fee and creator tax are both 0 makes the hook skip its
// HookFeeCollected, and pool trades are read only through that event: the PoolManager,
// which logs every swap on the chain, is not a source. Its trades would never be recorded,
// so the operator must hear about it.
export function zeroFeeWarning(pool: {
  poolId: Hex;
  launch: Address;
  hookFeeBps: number;
  creatorTaxBps: number;
}): string | undefined {
  if (pool.hookFeeBps !== 0 || pool.creatorTaxBps !== 0) return undefined;
  return (
    `WARNING: pool ${pool.poolId} of launch ${pool.launch} registered with a hook fee ` +
    `and a creator tax of 0. The hook emits no HookFeeCollected for it, so none of its ` +
    `trades will be indexed.`
  );
}
