import { getAddress, isAddress, type Address } from 'viem';
import { useReadContract } from 'wagmi';
import { launchFactoryAbi } from '@/shared/api';
import { contracts, supportedNetwork } from '@/shared/config';

/** The factory's record of one launch, as `getLaunchedToken` returns it. */
export type LaunchRecord = {
  token: Address;
  curve: Address;
  /** The wallet that launched the token: the Creator, who alone manages its Agent. */
  deployer: Address;
  creatorFeeRecipient: Address;
  pairToken: Address;
  creatorTaxBps: number;
  /** The Pool's fee and tick spacing, fixed at Launch. */
  poolFee: number;
  tickSpacing: number;
  /** A `GraduationPhase`. */
  phase: number;
  exists: boolean;
};

export type Loadable<T> = { status: 'loading' } | { status: 'error'; retry: () => void } | ({ status: 'ready' } & T);

/**
 * The factory's launch record for the address in the URL. `null` when the address is not one of
 * our launches, including when it is not an address at all. Re-read every `refreshMs`, if given.
 */
export function useLaunchRecord(
  param: string | undefined,
  { refreshMs }: { refreshMs?: number } = {},
): Loadable<{ launch: LaunchRecord | null }> {
  const address = param && isAddress(param, { strict: false }) ? getAddress(param) : undefined;
  const query = useReadContract({
    address: contracts.launchFactory,
    abi: launchFactoryAbi,
    functionName: 'getLaunchedToken',
    args: address && [address],
    chainId: supportedNetwork.id,
    query: { enabled: Boolean(address), refetchInterval: refreshMs ?? false },
  });

  if (!address) return { status: 'ready', launch: null };
  // A failed refresh keeps showing the last good record.
  if (query.data) return { status: 'ready', launch: query.data.exists ? query.data : null };
  if (query.isError) return { status: 'error', retry: () => void query.refetch() };
  return { status: 'loading' };
}
