/// <reference types="vite/client" />

/** Every variable is documented in `.env.example`, and checked at startup by `src/shared/config/env.ts`. */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_CHAIN_NAME?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_NATIVE_CURRENCY_NAME?: string;
  readonly VITE_NATIVE_CURRENCY_SYMBOL?: string;
  readonly VITE_NATIVE_CURRENCY_LOGO?: string;
  readonly VITE_EXPLORER_URL?: string;
  readonly VITE_MULTICALL3_ADDRESS?: string;
  readonly VITE_TESTNET?: string;
  readonly VITE_FAUCET_URL?: string;
  readonly VITE_LAUNCH_FACTORY_ADDRESS?: string;
  readonly VITE_LAUNCH_AND_BUY_ADDRESS?: string;
  readonly VITE_MEME_HOOK_ADDRESS?: string;
  readonly VITE_FEE_ESCROW_ADDRESS?: string;
  readonly VITE_V4_QUOTER_ADDRESS?: string;
  readonly VITE_STATE_VIEW_ADDRESS?: string;
  readonly VITE_UNIVERSAL_ROUTER_ADDRESS?: string;
  readonly VITE_PERMIT2_ADDRESS?: string;
  readonly VITE_QUOTE_ASSETS?: string;
  readonly VITE_AGENTS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
