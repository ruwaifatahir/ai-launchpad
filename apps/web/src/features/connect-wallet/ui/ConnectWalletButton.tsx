import { useConnectModal } from '@rainbow-me/rainbowkit';
import { Button } from '@/shared/ui/button';
import { useWalletStatus } from '../model/wallet-status';

/** Full-width `Connect wallet` call to action that opens the wallet list. */
export function ConnectWalletButton() {
  const { kind } = useWalletStatus();
  const { openConnectModal } = useConnectModal();
  const connecting = kind === 'connecting';

  return (
    <Button onClick={openConnectModal} disabled={connecting}>
      {connecting ? 'Connecting…' : 'Connect wallet'}
    </Button>
  );
}
