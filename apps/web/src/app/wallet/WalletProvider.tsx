import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { SessionProvider } from '@/features/connect-wallet';
import { walletConfig } from './wallet-config';
import { walletTheme } from './wallet-theme';

const queryClient = new QueryClient();

/** wagmi, its query cache, the wallet's Session, and RainbowKit's connect, sign in, account and network modals. */
export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={walletConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RainbowKitProvider theme={walletTheme} modalSize="compact">
            {children}
          </RainbowKitProvider>
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
