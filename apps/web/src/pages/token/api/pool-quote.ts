import { zeroAddress, type Address } from 'viem';
import { useSimulateContract } from 'wagmi';
import { v4QuoterAbi } from '@/shared/api';
import { supportedNetwork, uniswap } from '@/shared/config';
import { isContractRevert } from '@/shared/lib';
import { REFRESH_MS } from '../config/refresh';
import type { PoolQuote, TradeSide } from '../model/trade-plan';
import { isZeroForOne, type PoolKey } from '../model/uniswap-pool';

/** The largest amount the quoter takes: its `exactAmount` is a uint128. */
const MAX_UINT128 = 2n ** 128n - 1n;

/** Network failures are retried this many times before the quote shows as unavailable. */
const NETWORK_RETRIES = 2;

/**
 * The V4Quoter's quote for spending `amountIn` of `currencyIn` in the Pool, hook fee included.
 * Simulated, since the quoter runs the swap and reverts with the result. `undefined` while there is
 * nothing to quote or the quote is loading.
 */
export function usePoolQuote(
  key: PoolKey | null,
  side: TradeSide,
  currencyIn: Address,
  amountIn: bigint | undefined,
): PoolQuote | undefined {
  const quotable = key !== null && amountIn !== undefined && amountIn <= MAX_UINT128;
  const query = useSimulateContract({
    address: uniswap.v4Quoter,
    abi: v4QuoterAbi,
    functionName: 'quoteExactInputSingle',
    args:
      key && amountIn !== undefined
        ? [{ poolKey: key, zeroForOne: isZeroForOne(key, currencyIn), exactAmount: amountIn, hookData: '0x' }]
        : undefined,
    chainId: supportedNetwork.id,
    // Any caller gets the same quote. Without an account wagmi asks the wallet for one, which fails
    // while disconnected.
    account: zeroAddress,
    query: {
      enabled: quotable,
      refetchInterval: REFRESH_MS,
      // A revert is the quoter's answer for this amount, so asking again won't change it.
      retry: (failures, error) => !isContractRevert(error) && failures < NETWORK_RETRIES,
    },
  });

  if (key === null || amountIn === undefined) return undefined;
  if (!quotable) return { side, amountIn, amountOut: null, failure: 'refused' };
  if (query.data) return { side, amountIn, amountOut: query.data.result[0] };
  if (query.isError) {
    return { side, amountIn, amountOut: null, failure: isContractRevert(query.error) ? 'refused' : 'unreachable' };
  }
  return undefined;
}
