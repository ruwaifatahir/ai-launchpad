import { useBalance } from 'wagmi';
import { supportedNetwork } from '@/shared/config';
import { formatBalance } from '../lib/format-balance';
import { useConnectedAddress } from './wallet-status';

export type WalletBalance = {
  /** Ready to display (`0.4213 ETH`); `undefined` while disconnected, loading, or unavailable. */
  amount: string | undefined;
  /** The read failed, so the balance won't arrive without a retry. */
  unavailable: boolean;
};

/**
 * The Connected wallet's ETH balance on the Supported network.
 * Read from our RPC, so it shows even while the wallet is on the Wrong network.
 */
export function useWalletBalance(): WalletBalance {
  const address = useConnectedAddress();
  const { data, isError } = useBalance({ address, chainId: supportedNetwork.id, query: { enabled: Boolean(address) } });

  return {
    amount: address && data ? formatBalance(data.formatted, data.symbol) : undefined,
    unavailable: Boolean(address) && isError,
  };
}
