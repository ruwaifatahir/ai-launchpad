import { defineChain } from 'viem';
import { env } from './env';

const { chain } = env;

/** The one network the app runs on, as the `VITE_CHAIN_*` variables describe it. */
export const supportedNetwork = defineChain({
  id: chain.id,
  name: chain.name,
  nativeCurrency: { ...chain.nativeCurrency, decimals: 18 },
  rpcUrls: { default: { http: chain.rpcUrls } },
  blockExplorers: { default: { name: `${chain.name} explorer`, url: chain.explorerUrl } },
  contracts: { multicall3: { address: chain.multicall3 } },
  testnet: chain.testnet,
});
