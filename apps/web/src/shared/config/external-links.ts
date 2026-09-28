import { env } from './env';

const EXPLORER = env.chain.explorerUrl;

/** Links out of the app: the chain's own explorer and faucet, the source code, and X's own help where a Creator needs it. */
export const externalLinks = {
  /** How to turn on the automated label an Agent's X account must show. */
  xAutomatedLabel: 'https://help.x.com/en/using-x/automated-account-labels',
  /** Test funds for gas, the launch fee and native Developer buys. `null` when the chain has none to offer. */
  faucet: env.faucetUrl,
  /** The app's source code. */
  sourceCode: 'https://github.com/ruwaifatahir/ai-launchpad',
  explorerToken: (address: string) => `${EXPLORER}/token/${address}`,
  explorerTx: (hash: string) => `${EXPLORER}/tx/${hash}`,
  explorerAddress: (address: string) => `${EXPLORER}/address/${address}`,
} as const;

/** Static images served from our own origin (`public/`). */
export const assetUrls = {
  logo: '/ai-launchpad-logo.svg',
  native: env.chain.nativeCurrencyLogo,
  pair: (symbol: string) => `/pairs/${symbol.toLowerCase()}.svg`,
} as const;
