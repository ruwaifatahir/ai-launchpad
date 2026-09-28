import { useConnectModal } from '@rainbow-me/rainbowkit';
import type { Address } from 'viem';
import { useSessionStatus } from './session';
import { useSwitchToSupportedNetwork, useWalletStatus } from './wallet-status';

/**
 * What stands between the Connected wallet and a call that needs a Session: nothing (`ready`),
 * a wallet still settling, or one step the user can take. This is the one place that orders those
 * steps; the header and every gated control read it.
 */
export type SessionGate =
  | { kind: 'ready'; address: Address }
  | { kind: 'settling' }
  | { kind: 'connect'; open: () => void }
  | { kind: 'switch-network'; open: () => void; address: Address; switching: boolean }
  | { kind: 'sign-in'; open: () => void; address: Address };

/** The gate for the Connected wallet right now. `open` takes the one step that moves it along. */
export function useSessionGate(): SessionGate {
  const wallet = useWalletStatus();
  const session = useSessionStatus();
  // Without a Session RainbowKit's connect modal opens its sign in step.
  const { openConnectModal } = useConnectModal();
  const { switchNetwork, isSwitching } = useSwitchToSupportedNetwork();
  const connect = () => openConnectModal?.();

  // Signing in waits for the Supported network (see SessionProvider), so switching comes first.
  switch (wallet.kind) {
    case 'disconnected':
      return { kind: 'connect', open: connect };
    case 'connecting':
      return { kind: 'settling' };
    case 'wrong-network':
      return { kind: 'switch-network', open: switchNetwork, address: wallet.address, switching: isSwitching };
    case 'ready':
      if (session === 'loading') return { kind: 'settling' };
      return session === 'authenticated'
        ? { kind: 'ready', address: wallet.address }
        : { kind: 'sign-in', open: connect, address: wallet.address };
  }
}
