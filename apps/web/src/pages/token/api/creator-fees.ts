import { useReadContracts } from 'wagmi';
import { supportedNetwork } from '@/shared/config';
import { REFRESH_MS } from '../config/refresh';
import { claimableCall } from '../model/creator-fees';
import type { TokenIdentity } from '../model/token-identity';

/**
 * What the token's Creator wallet can claim from the fee escrow right now, in the Paired asset's
 * smallest unit. It spans every launch paid to that wallet. `undefined` until the first read
 * lands; a failed refresh keeps the last good amount.
 */
export function useClaimableCreatorFees(identity: TokenIdentity): bigint | undefined {
  // `useReadContracts` takes the ETH and ERC-20 reads alike, where `useReadContract` wants one function.
  const query = useReadContracts({
    allowFailure: false,
    contracts: [{ ...claimableCall(identity.creatorWallet, identity.pair), chainId: supportedNetwork.id }],
    query: { refetchInterval: REFRESH_MS },
  });
  return query.data?.[0];
}
