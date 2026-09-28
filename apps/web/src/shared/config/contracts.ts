import { env } from './env';

/** Our launchpad contracts on the Supported network, from the `VITE_*_ADDRESS` variables. */
export const contracts = {
  launchFactory: env.contracts.launchFactory,
  launchAndBuy: env.contracts.launchAndBuy,
  /** The hook on every graduated Pool, as the factory's `memeHook()` returns it. */
  memeHook: env.contracts.memeHook,
  /** Holds the creator fees every launch owes its Creator wallet, until that wallet claims them. */
  feeEscrow: env.contracts.feeEscrow,
} as const;

/**
 * The Uniswap v4 periphery on the Supported network. Each must serve the same PoolManager as the
 * factory's `poolManager()`, or quotes, prices and swaps read a different set of Pools.
 */
export const uniswap = {
  /** Quotes a swap, hook fee included. */
  v4Quoter: env.uniswap.v4Quoter,
  /** Reads a Pool's price. */
  stateView: env.uniswap.stateView,
  /** Sends swaps. Its V4 exact-in single swap takes a sixth, uint256 field. */
  universalRouter: env.uniswap.universalRouter,
  /** Permit2, through which the router pulls ERC-20 input. The same address on every chain. */
  permit2: env.uniswap.permit2,
} as const;

/** Every launch uses preset #0, the only one the factory has. */
export const LAUNCH_CONFIG_ID = 0n;
