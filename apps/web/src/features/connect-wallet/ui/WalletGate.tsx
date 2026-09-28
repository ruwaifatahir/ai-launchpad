import type { ReactNode } from 'react';
import { supportedNetwork } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { useSwitchToSupportedNetwork, useWalletStatus } from '../model/wallet-status';
import { ConnectWalletButton } from './ConnectWalletButton';

/**
 * Renders `children` once a Connected wallet is on the Supported network.
 * Until then it renders the button that gets the user there: connect, or switch network.
 */
export function WalletGate({ children }: { children: ReactNode }) {
  const { kind } = useWalletStatus();
  const { switchNetwork, isSwitching } = useSwitchToSupportedNetwork();

  if (kind === 'ready') return children;
  if (kind === 'wrong-network') {
    return (
      <Button onClick={switchNetwork} disabled={isSwitching}>
        Switch to {supportedNetwork.name}
      </Button>
    );
  }
  return <ConnectWalletButton />;
}
