import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem';
import { contracts } from '@/shared/config';

/** A Uniswap v4 Pool's key: its two currencies, lowest address first, with ETH as `address(0)`. */
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

/** The slice of the factory's launch record that names its Pool. */
export type PoolLaunch = { token: Address; pairToken: Address; poolFee: number; tickSpacing: number };

/**
 * The PoolKey of a graduated launch: the token and its Paired asset sorted by address, so ETH is
 * always currency0, with the fee and tick spacing from the launch record and our MemeHook.
 */
export function poolKey(launch: PoolLaunch): PoolKey {
  const tokenFirst = BigInt(launch.token) < BigInt(launch.pairToken);
  return {
    currency0: tokenFirst ? launch.token : launch.pairToken,
    currency1: tokenFirst ? launch.pairToken : launch.token,
    fee: launch.poolFee,
    tickSpacing: launch.tickSpacing,
    hooks: contracts.memeHook,
  };
}

const POOL_KEY_COMPONENTS = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const;

/** The Pool's id, as StateView and the PoolManager know it: `keccak256(abi.encode(key))`. */
export function poolId(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(POOL_KEY_COMPONENTS, [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]),
  );
}

/** Whether a swap spending `currencyIn` moves the Pool from currency0 to currency1. */
export const isZeroForOne = (key: PoolKey, currencyIn: Address) => BigInt(currencyIn) === BigInt(key.currency0);

/** The UniversalRouter's command for a Uniswap v4 swap. */
const V4_SWAP = '0x10';

/** v4-periphery `Actions`: an exact-in single-pool swap, then pay all that is owed, then take all that is due. */
const SWAP_EXACT_IN_SINGLE = '06';
const SETTLE_ALL = '0c';
const TAKE_ALL = '0f';

/**
 * The router's exact-in single swap. Our UniversalRouter's build takes a sixth, uint256 field after
 * the minimum out (a newer v4-periphery's per-hop limit), which zero leaves off; the five-field
 * struct reverts.
 * Checked by simulating a TMEME buy against it on 2026-09-25.
 */
const EXACT_INPUT_SINGLE = [
  {
    type: 'tuple',
    components: [
      { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
      { name: 'zeroForOne', type: 'bool' },
      { name: 'amountIn', type: 'uint128' },
      { name: 'amountOutMinimum', type: 'uint128' },
      { name: 'hopLimit', type: 'uint256' },
      { name: 'hookData', type: 'bytes' },
    ],
  },
] as const;

const CURRENCY_AND_AMOUNT = [{ type: 'address' }, { type: 'uint256' }] as const;

export type PoolSwap = {
  key: PoolKey;
  currencyIn: Address;
  amountIn: bigint;
  /** The least the swap accepts; below it the router reverts. */
  minOut: bigint;
  /** Unix seconds after which the router refuses the swap. */
  deadline: bigint;
};

/**
 * The UniversalRouter `execute` arguments for one exact-in swap in the Pool: swap, then settle
 * all the input (from the ETH sent, or through Permit2), then take all the output to the sender.
 */
export function encodePoolSwap(swap: PoolSwap): readonly [Hex, readonly Hex[], bigint] {
  const { key, currencyIn, amountIn, minOut } = swap;
  const zeroForOne = isZeroForOne(key, currencyIn);
  const currencyOut = zeroForOne ? key.currency1 : key.currency0;
  const params = [
    encodeAbiParameters(EXACT_INPUT_SINGLE, [
      { poolKey: key, zeroForOne, amountIn, amountOutMinimum: minOut, hopLimit: 0n, hookData: '0x' },
    ]),
    encodeAbiParameters(CURRENCY_AND_AMOUNT, [currencyIn, amountIn]),
    encodeAbiParameters(CURRENCY_AND_AMOUNT, [currencyOut, minOut]),
  ];
  const actions: Hex = `0x${SWAP_EXACT_IN_SINGLE}${SETTLE_ALL}${TAKE_ALL}`;
  const input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, params]);
  return [V4_SWAP, [input], swap.deadline];
}
