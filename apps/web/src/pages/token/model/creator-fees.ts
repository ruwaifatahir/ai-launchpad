import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Address } from 'viem';
import { feeEscrowAbi } from '@/shared/api';
import { contracts, externalLinks, isNativeAsset } from '@/shared/config';
import {
  describeTransactionError,
  invalidateChainReads,
  isUserRejection,
  sendInOrder,
  useSingleFlight,
  useTransactionSender,
  type TransactionStage,
} from '@/shared/lib';
import { toast } from '@/shared/ui/toast';
import type { TokenIdentity } from './token-identity';

type PairedAsset = TokenIdentity['pair'];

/**
 * The escrow read of what `creatorWallet` can claim in `pair`, summed over every launch paid to it:
 * `balanceOf` for ETH, `balanceOfToken` for an ERC-20 Paired asset.
 */
export function claimableCall(creatorWallet: Address, pair: PairedAsset) {
  const escrow = { address: contracts.feeEscrow, abi: feeEscrowAbi } as const;
  return isNativeAsset(pair)
    ? ({ ...escrow, functionName: 'balanceOf', args: [creatorWallet] } as const)
    : ({ ...escrow, functionName: 'balanceOfToken', args: [creatorWallet, pair.address] } as const);
}

/** The escrow call that pays the caller its whole balance in `pair`: `claim()` for ETH, `claimToken` otherwise. */
export function claimCall(pair: PairedAsset) {
  const escrow = { address: contracts.feeEscrow, abi: feeEscrowAbi } as const;
  return isNativeAsset(pair)
    ? ({ ...escrow, functionName: 'claim', args: [] } as const)
    : ({ ...escrow, functionName: 'claimToken', args: [pair.address] } as const);
}

/** Where a claim is: the call is signed, then waited on until the page has re-read the amount. */
export type ClaimStatus = 'idle' | TransactionStage;

export type ClaimCreatorFees = { status: ClaimStatus; submit: () => Promise<void> };

/**
 * Claims the Connected wallet's creator fees in `pair`, with the trade toasts. Once it settles
 * every read on the page refreshes, so the claimable amount drops to what is left.
 */
export function useClaimCreatorFees(pair: PairedAsset): ClaimCreatorFees {
  const queryClient = useQueryClient();
  const sender = useTransactionSender();
  const singleFlight = useSingleFlight();
  const [status, setStatus] = useState<ClaimStatus>('idle');

  const submit = () =>
    singleFlight(async () => {
      try {
        const receipt = await sendInOrder(sender, [claimCall(pair)], {
          onStage: setStatus,
          revertMessage: () => 'The claim reverted',
        });
        toast.success({
          title: `Creator fees claimed in ${pair.symbol}`,
          action: { label: 'View transaction', href: externalLinks.explorerTx(receipt.transactionHash) },
        });
      } catch (error) {
        if (!isUserRejection(error)) {
          toast.error({ title: 'Claim failed', description: describeTransactionError(error) });
        }
      } finally {
        // Stays busy until the amount is re-read, so the same fees can't be claimed twice.
        await invalidateChainReads(queryClient);
        setStatus('idle');
      }
    });

  return { status, submit };
}
