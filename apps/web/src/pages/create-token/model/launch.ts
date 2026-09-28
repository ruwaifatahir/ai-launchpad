import { createContext, use, useState } from 'react';
import { useNavigate } from 'react-router';
import { erc20Abi, parseEventLogs, toHex, zeroAddress, zeroHash } from 'viem';
import { useConfig } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { useConnectedAddress } from '@/features/connect-wallet';
import { launchFactoryAbi } from '@/shared/api';
import { externalLinks, routes, supportedNetwork } from '@/shared/config';
import {
  describeTransactionError,
  isUserRejection,
  sendInOrder,
  useSingleFlight,
  useTransactionSender,
  type ContractCall,
} from '@/shared/lib';
import { toast } from '@/shared/ui/toast';
import { useLaunchDraft } from './launch-draft';
import { launchCost, planLaunch, type LaunchErrors } from './launch-plan';
import { useLaunchTerms } from './launch-terms';
import { useLogoUpload, type LogoUploadStatus } from './logo-upload';
import { usePairedAssetBalance } from './paired-balance';

/** Where a launch is: each wallet request is signed, then waited on. */
export type LaunchStatus =
  | { kind: 'idle' }
  | { kind: 'approve-signing' }
  | { kind: 'approve-confirming' }
  | { kind: 'signing' }
  | { kind: 'confirming' };

/** How a launch attempt ended: `invalid` means the form has errors to fix first. */
export type LaunchOutcome = 'invalid' | 'settled';

export type LaunchContextValue = {
  state: {
    status: LaunchStatus;
    /** Money problems show as soon as they exist; the other field errors from the first attempt on. */
    errors: LaunchErrors;
    /** What the launch spends, in base units; `undefined` until the terms are read. */
    cost: { eth: bigint; paired: bigint } | undefined;
    busy: boolean;
    /** The terms are read, a wallet is connected, and no logo upload is running. */
    ready: boolean;
    /** The logo upload, which blocks the launch until it settles so the draft's logo is never stale. */
    logoUpload: LogoUploadStatus;
  };
  actions: {
    launch: () => Promise<LaunchOutcome>;
    /** Stores the picked file and puts its URL in the draft; refusals show as the upload's status. */
    uploadLogo: (file: File) => Promise<void>;
    /** Drops a stored logo whose image would not draw, and says so as the upload's status. */
    rejectUnreadableLogo: () => void;
  };
};

export const LaunchContext = createContext<LaunchContextValue | null>(null);

/** The launch the Create page is running; read inside <LaunchProvider>. */
export function useLaunch() {
  const context = use(LaunchContext);
  if (!context) throw new Error('useLaunch must be used inside <LaunchProvider>');
  return context;
}

/** A fresh CREATE2 salt, so the same draft launched twice gets two addresses. */
const randomSalt = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

/**
 * Launches the draft: approves an ERC-20 Developer buy if needed, sends the launch,
 * and opens the Token page once it lands. Used once, by LaunchProvider.
 */
export function useLaunchController(): LaunchContextValue {
  const config = useConfig();
  const navigate = useNavigate();
  const launcher = useConnectedAddress();
  const { state: draft, actions: draftActions } = useLaunchDraft();
  const logoUpload = useLogoUpload((url) => draftActions.set('logo', url));
  const { terms } = useLaunchTerms(draft.pairedAsset);
  const { balances, refetch: refetchBalances } = usePairedAssetBalance(draft.pairedAsset);
  const [status, setStatus] = useState<LaunchStatus>({ kind: 'idle' });
  const [attempted, setAttempted] = useState(false);
  const sender = useTransactionSender();
  const singleFlight = useSingleFlight();

  // Validation needs neither a real launcher nor a salt; those are filled in at submit.
  const preview = terms && planLaunch(draft, terms, { launcher: launcher ?? zeroAddress, salt: zeroHash, balances });
  const allErrors = preview && !preview.ok ? preview.errors : {};
  const errors = attempted ? allErrors : { developerBuy: allErrors.developerBuy, launchFee: allErrors.launchFee };

  async function launch(): Promise<LaunchOutcome> {
    const outcome = await singleFlight(async (): Promise<LaunchOutcome> => {
      if (!terms || !launcher) return 'settled';
      setAttempted(true);
      const plan = planLaunch(draft, terms, { launcher, salt: randomSalt(), balances });
      if (!plan.ok) return 'invalid';

      const symbol = draft.pairedAsset.symbol;
      const { transaction } = plan;
      try {
        const calls: ContractCall[] = [transaction];
        if (plan.approval) {
          const { token, spender, amount } = plan.approval;
          const allowance = await readContract(config, {
            address: token,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [launcher, spender],
            chainId: supportedNetwork.id,
          });
          if (allowance < amount) {
            calls.unshift({ address: token, abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
          }
        }

        const receipt = await sendInOrder(sender, calls, {
          onStage: (stage, call) =>
            setStatus(call === transaction ? { kind: stage } : { kind: `approve-${stage}` as const }),
          revertMessage: (call) =>
            call === transaction ? 'The launch transaction reverted' : `The ${symbol} approval reverted`,
        });

        // Both paths launch through the factory, so its event names the new token either way.
        const [launched] = parseEventLogs({ abi: launchFactoryAbi, eventName: 'TokenLaunched', logs: receipt.logs });
        if (!launched) throw new Error('Launched, but the token address was not in the receipt');
        toast.success({
          title: `${draft.ticker.trim()} launched`,
          description: `${draft.name.trim()} is live and trading against ${symbol}.`,
          action: { label: 'View transaction', href: externalLinks.explorerTx(receipt.transactionHash) },
        });
        void navigate(routes.token(launched.args.token));
      } catch (error) {
        if (!isUserRejection(error)) {
          toast.error({ title: 'Launch failed', description: describeTransactionError(error) });
        }
      } finally {
        setStatus({ kind: 'idle' });
        refetchBalances();
      }
      return 'settled';
    });
    return outcome ?? 'settled';
  }

  return {
    state: {
      status,
      errors,
      cost: terms && launchCost(draft, terms),
      busy: status.kind !== 'idle',
      ready: Boolean(terms && launcher) && logoUpload.status.kind !== 'uploading',
      logoUpload: logoUpload.status,
    },
    actions: { launch, uploadLogo: logoUpload.upload, rejectUnreadableLogo: logoUpload.rejectUnreadable },
  };
}
