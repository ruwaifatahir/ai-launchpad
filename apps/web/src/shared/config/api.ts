import { env } from './env';

/** Base URL of the AI Launchpad API, without a trailing slash. */
export const apiUrl = env.apiUrl;

/** Enables QR and mobile wallets through WalletConnect; empty offers browser wallets only. */
export const walletConnectProjectId = env.walletConnectProjectId;
