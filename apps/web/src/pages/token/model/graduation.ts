import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Address } from 'viem';
import { launchFactoryAbi } from '@/shared/api';
import { contracts, externalLinks } from '@/shared/config';
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
import type { TokenStage } from './token-stage';

type GraduationStep = Extract<TokenStage, { kind: 'graduation-pending' }>['nextStep'];

/**
 * The factory call that takes a Graduation pending token one step on: `graduate` sweeps a
 * sold-out curve, `createGraduatedPool` opens a swept launch's Pool. Anyone may send either.
 */
export function graduationCall(token: Address, nextStep: GraduationStep) {
  return {
    address: contracts.launchFactory,
    abi: launchFactoryAbi,
    functionName: nextStep === 'graduate' ? 'graduate' : 'createGraduatedPool',
    args: [token],
  } as const;
}

/** Where finishing Graduation is: the call is signed, then waited on until the page has re-read the stage. */
export type GraduationStatus = 'idle' | TransactionStage;

export type FinishGraduation = { status: GraduationStatus; submit: () => Promise<void> };

/**
 * Sends the step Graduation still needs from the Connected wallet, with the trade toasts. Once it
 * settles every read on the page refreshes, so the stage moves on: sold out, then swept, then Pool.
 */
export function useFinishGraduation(
  token: { address: Address; symbol: string },
  nextStep: GraduationStep,
): FinishGraduation {
  const queryClient = useQueryClient();
  const sender = useTransactionSender();
  const singleFlight = useSingleFlight();
  const [status, setStatus] = useState<GraduationStatus>('idle');

  const submit = () =>
    singleFlight(async () => {
      const sweep = nextStep === 'graduate';
      try {
        const receipt = await sendInOrder(sender, [graduationCall(token.address, nextStep)], {
          onStage: setStatus,
          revertMessage: () => (sweep ? 'The sweep reverted' : 'The Pool creation reverted'),
        });
        toast.success({
          title: sweep ? `${token.symbol} swept for Graduation` : `${token.symbol} Pool created`,
          description: sweep ? 'One more step opens its Pool.' : undefined,
          action: { label: 'View transaction', href: externalLinks.explorerTx(receipt.transactionHash) },
        });
      } catch (error) {
        if (!isUserRejection(error)) {
          toast.error({ title: 'Graduation failed', description: describeTransactionError(error) });
        }
      } finally {
        // Stays busy until the stage is re-read, so the old step can't be sent twice.
        await invalidateChainReads(queryClient);
        setStatus('idle');
      }
    });

  return { status, submit };
}
