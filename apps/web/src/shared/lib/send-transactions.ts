import type { Abi, Address, Hash, TransactionReceipt } from 'viem';
import { useConfig } from 'wagmi';
import { waitForTransactionReceipt, writeContract, type WriteContractParameters } from 'wagmi/actions';
import { supportedNetwork } from '@/shared/config';

/**
 * A contract call ready to send. Each caller builds its calls against their typed ABIs, so the
 * args already match the function; this looser shape lets one sender take any of them.
 */
export type ContractCall = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  gas?: bigint;
};

/** Where one call is: waiting on the user to sign it, then on the network to mine it. */
export type TransactionStage = 'signing' | 'confirming';

/** Signs a call in the wallet, and waits for a sent one to be mined. */
export type TransactionSender = {
  sign: (call: ContractCall) => Promise<Hash>;
  confirm: (hash: Hash) => Promise<TransactionReceipt>;
};

/**
 * Sends `calls` one after another, each mined before the next is signed, and returns the last
 * receipt. A call that is mined but reverts throws `revertMessage(call)`, so the rest are never sent.
 */
export async function sendInOrder<Call extends ContractCall>(
  sender: TransactionSender,
  calls: readonly Call[],
  options: {
    onStage?: (stage: TransactionStage, call: Call) => void;
    revertMessage: (call: Call) => string;
  },
): Promise<TransactionReceipt> {
  let receipt: TransactionReceipt | undefined;
  for (const call of calls) {
    options.onStage?.('signing', call);
    const hash = await sender.sign(call);
    options.onStage?.('confirming', call);
    receipt = await sender.confirm(hash);
    if (receipt.status !== 'success') throw new Error(options.revertMessage(call));
  }
  if (!receipt) throw new Error('No transaction to send');
  return receipt;
}

/** The Connected wallet as a `TransactionSender`, on the Supported network. */
export function useTransactionSender(): TransactionSender {
  const config = useConfig();
  const chainId = supportedNetwork.id;
  return {
    // The one cast behind every send: each call's args were checked against its ABI where it was built.
    sign: (call) => writeContract(config, { ...call, chainId } as WriteContractParameters),
    confirm: (hash) => waitForTransactionReceipt(config, { hash, chainId }),
  };
}
