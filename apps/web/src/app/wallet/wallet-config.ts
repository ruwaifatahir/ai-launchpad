import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, fallback, http } from 'wagmi';
import { supportedNetwork, walletConnectProjectId as projectId } from '@/shared/config';

if (!projectId) {
  console.warn('VITE_WALLETCONNECT_PROJECT_ID is not set: only browser wallets are offered. See .env.example.');
}

// MetaMask (when not installed), Rainbow and WalletConnect pair over WalletConnect, and RainbowKit
// throws without a project ID. Until one is set, offer only wallets that connect in the browser.
// Installed wallets that announce themselves (EIP-6963) are listed either way.
const wallets = projectId
  ? [metaMaskWallet, rabbyWallet, coinbaseWallet, rainbowWallet, walletConnectWallet]
  : [rabbyWallet, coinbaseWallet, injectedWallet];

export const walletConfig = createConfig({
  chains: [supportedNetwork],
  connectors: connectorsForWallets([{ groupName: 'Popular', wallets }], { appName: 'AI Launchpad', projectId }),
  transports: {
    [supportedNetwork.id]: fallback(supportedNetwork.rpcUrls.default.http.map((url) => http(url))),
  },
});
