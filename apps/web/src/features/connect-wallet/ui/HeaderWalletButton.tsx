import { useAccountModal, useChainModal } from '@rainbow-me/rainbowkit';
import type { ReactNode } from 'react';
import { supportedNetwork } from '@/shared/config';
import { shortenAddress } from '@/shared/lib';
import { ChevronDownIcon, WalletIcon } from '@/shared/ui/icon';
import { useSessionGate } from '../model/session-gate';
import './connect-wallet.css';

function Spinner() {
  return <span className="nav-wallet-spinner" aria-hidden="true" />;
}

/** Shown in place of the text on phones, where the nav has no room for it. */
function PhoneIcon() {
  return (
    <span className="nav-wallet-icon" aria-hidden="true">
      <WalletIcon />
    </span>
  );
}

/** Visible on wider screens; on phones only screen readers get it. */
function Label({ children }: { children: ReactNode }) {
  return <span className="nav-wallet-label">{children}</span>;
}

function ConnectingButton() {
  return (
    <button type="button" className="nav-wallet" disabled>
      <Spinner />
      <Label>Connecting…</Label>
    </button>
  );
}

/**
 * The nav's wallet control, one button whose look follows the wallet:
 * `Connect wallet`, `Connecting…`, `Sign in` for a wallet on the Supported network without a Session,
 * the address with a green dot on the Supported network,
 * or `Wrong network` in amber, which switches networks in one click.
 * On phones each state shrinks to a wallet icon, with the dot as a badge.
 */
export function HeaderWalletButton() {
  const gate = useSessionGate();
  const { openAccountModal } = useAccountModal();
  // RainbowKit's account modal is unavailable on the Wrong network; its network modal still offers Disconnect.
  const { openChainModal } = useChainModal();

  switch (gate.kind) {
    case 'connect':
      return (
        <button type="button" className="nav-connect" onClick={gate.open}>
          <PhoneIcon />
          <Label>Connect wallet</Label>
        </button>
      );
    case 'settling':
      return <ConnectingButton />;
    case 'switch-network':
      return (
        <div className="nav-wallet-group is-wrong-network">
          <button
            type="button"
            className="nav-wallet"
            onClick={gate.open}
            disabled={gate.switching}
            title={`Switch to ${supportedNetwork.name}`}
          >
            {gate.switching ? <Spinner /> : <PhoneIcon />}
            {gate.switching ? null : <span className="nav-wallet-dot" aria-hidden="true" />}
            <Label>{gate.switching ? 'Switching…' : 'Wrong network'}</Label>
            <span className="nav-wallet-address">{shortenAddress(gate.address)}</span>
          </button>
          <button
            type="button"
            className="nav-wallet nav-wallet-caret"
            onClick={openChainModal}
            aria-haspopup="dialog"
            aria-label="Network and disconnect options"
          >
            <ChevronDownIcon />
          </button>
        </div>
      );
    case 'sign-in':
      return (
        <button type="button" className="nav-connect" onClick={gate.open} title={gate.address}>
          <PhoneIcon />
          <Label>Sign in</Label>
        </button>
      );
    case 'ready':
      return (
        <button
          type="button"
          className="nav-wallet"
          onClick={openAccountModal}
          aria-haspopup="dialog"
          title={gate.address}
        >
          <PhoneIcon />
          <span className="nav-wallet-dot" aria-hidden="true" />
          <Label>{shortenAddress(gate.address)}</Label>
          <span className="nav-wallet-chevron" aria-hidden="true">
            <ChevronDownIcon />
          </span>
        </button>
      );
  }
}
