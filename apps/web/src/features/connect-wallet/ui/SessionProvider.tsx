import { RainbowKitAuthenticationProvider } from '@rainbow-me/rainbowkit';
import { useEffect, type ReactNode } from 'react';
import { isAddressEqual } from 'viem';
import { useAccount } from 'wagmi';
import { clearCredential, useCredential } from '@/shared/auth';
import { supportedNetwork } from '@/shared/config';
import { useSessionAdapter, useSessionStatus } from '../model/session';

/**
 * Asks a wallet to sign in right after it connects, in RainbowKit's modal, and keeps its Session.
 * Wraps `RainbowKitProvider`; needs wagmi and react-query above it.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const adapter = useSessionAdapter();
  const status = useSessionStatus();
  const { address, chainId } = useAccount();
  const credential = useCredential();

  // RainbowKit only signs out on an account change while signed in. A Credential for another wallet,
  // found after a reload or a change while signed out, goes too: it must not come back on a switch back.
  useEffect(() => {
    if (address && credential && !isAddressEqual(address, credential.wallet)) clearCredential();
  }, [address, credential]);

  return (
    // RainbowKit's sign button does nothing on a network wagmi is not configured for, so the sign in step
    // waits for the Supported network. Until then its network modal stays available to switch.
    <RainbowKitAuthenticationProvider adapter={adapter} status={status} enabled={chainId === supportedNetwork.id}>
      {children}
    </RainbowKitAuthenticationProvider>
  );
}
