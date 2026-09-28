import type { Address } from 'viem';
import { useAccount, useSwitchChain } from 'wagmi';
import { supportedNetwork } from '@/shared/config';

/** Where the Connected wallet stands: disconnected, connecting, on another network, or ready. */
export type WalletStatus =
  | { kind: 'disconnected' }
  | { kind: 'connecting' }
  | { kind: 'wrong-network'; address: Address }
  | { kind: 'ready'; address: Address };

export function useWalletStatus(): WalletStatus {
  const { address, chainId, status } = useAccount();

  if (status === 'connecting' || status === 'reconnecting') return { kind: 'connecting' };
  if (!address) return { kind: 'disconnected' };
  return chainId === supportedNetwork.id ? { kind: 'ready', address } : { kind: 'wrong-network', address };
}

/** The Connected wallet's address, on any network. `undefined` while disconnected or connecting. */
export function useConnectedAddress(): Address | undefined {
  const wallet = useWalletStatus();
  return wallet.kind === 'ready' || wallet.kind === 'wrong-network' ? wallet.address : undefined;
}

/** Asks the wallet to switch to the Supported network, adding it to the wallet first if needed. */
export function useSwitchToSupportedNetwork() {
  const { switchChain, isPending } = useSwitchChain();

  return {
    switchNetwork: () => switchChain({ chainId: supportedNetwork.id }),
    isSwitching: isPending,
  };
}
