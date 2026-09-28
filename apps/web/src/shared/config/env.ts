import { getAddress, isAddress, zeroAddress, type Address } from 'viem';

/** An ERC-20 a launch can pair with, besides the native asset. */
export type QuoteAssetEnv = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Icon path or URL; `/pairs/<symbol>.svg` when unset. */
  logo?: string;
  /** A test token with a public `mint`: the launch form offers a button to mint some. */
  mintable?: boolean;
};

/** Everything the app reads from `VITE_*` variables, parsed and checked. */
export type AppEnv = {
  apiUrl: string;
  walletConnectProjectId: string;
  chain: {
    id: number;
    name: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string };
    /** Icon path or URL for the native currency. */
    nativeCurrencyLogo: string;
    explorerUrl: string;
    multicall3: Address;
    testnet: boolean;
  };
  /** `null` hides every "get test funds" link. */
  faucetUrl: string | null;
  contracts: { launchFactory: Address; launchAndBuy: Address; memeHook: Address; feeEscrow: Address };
  uniswap: { v4Quoter: Address; stateView: Address; universalRouter: Address; permit2: Address };
  quoteAssets: QuoteAssetEnv[];
  agentsEnabled: boolean;
};

export type EnvResult = { env: AppEnv; errors: string[] };

/** Permit2 lives at the same address on every chain it is deployed to. */
const CANONICAL_PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

/** Multicall3 lives at the same address on nearly every EVM chain; batched reads go through it. */
const CANONICAL_MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

type RawEnv = Readonly<Record<string, unknown>>;

/**
 * Reads the app's configuration out of `raw` (`import.meta.env`). Never throws: every problem is
 * listed in `errors`, and the field it concerns falls back to a harmless placeholder so the modules
 * that read `env` still load. The app shows `errors` instead of rendering when there are any.
 */
export function parseEnv(raw: RawEnv): EnvResult {
  const errors: string[] = [];

  const text = (name: string): string | undefined => {
    const value = raw[name];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  };

  const required = (name: string): string => {
    const value = text(name);
    if (value === undefined) errors.push(`${name} is not set.`);
    return value ?? '';
  };

  const url = (name: string, value: string): string => {
    if (!/^https?:\/\/[^\s/]+/.test(value)) {
      errors.push(`${name} must be an http(s) URL, got "${value}".`);
      return 'http://localhost';
    }
    return value.replace(/\/+$/, '');
  };

  const requiredUrl = (name: string): string => {
    const value = required(name);
    return value ? url(name, value) : 'http://localhost';
  };

  const flag = (name: string): boolean => {
    const value = text(name);
    if (value === undefined || value === 'false') return false;
    if (value === 'true') return true;
    errors.push(`${name} must be "true" or "false", got "${value}".`);
    return false;
  };

  const address = (name: string, fallback?: Address): Address => {
    const value = text(name);
    if (value === undefined) {
      if (fallback) return fallback;
      errors.push(`${name} is not set.`);
      return zeroAddress;
    }
    if (!isAddress(value, { strict: false })) {
      errors.push(`${name} must be a 0x-prefixed 20-byte address, got "${value}".`);
      return zeroAddress;
    }
    return getAddress(value);
  };

  const chainIdText = required('VITE_CHAIN_ID');
  const chainId = Number(chainIdText);
  if (chainIdText && !(Number.isSafeInteger(chainId) && chainId > 0)) {
    errors.push(`VITE_CHAIN_ID must be a positive integer, got "${chainIdText}".`);
  }

  const rpcText = required('VITE_RPC_URL');
  const rpcUrls = rpcText ? rpcText.split(',').map((entry) => url('VITE_RPC_URL', entry.trim())) : ['http://localhost'];

  const faucet = text('VITE_FAUCET_URL');

  const env: AppEnv = {
    apiUrl: requiredUrl('VITE_API_URL'),
    walletConnectProjectId: text('VITE_WALLETCONNECT_PROJECT_ID') ?? '',
    chain: {
      id: Number.isSafeInteger(chainId) && chainId > 0 ? chainId : 1,
      name: required('VITE_CHAIN_NAME'),
      rpcUrls,
      nativeCurrency: {
        name: required('VITE_NATIVE_CURRENCY_NAME'),
        symbol: required('VITE_NATIVE_CURRENCY_SYMBOL'),
      },
      nativeCurrencyLogo: text('VITE_NATIVE_CURRENCY_LOGO') ?? '/ethereum.svg',
      explorerUrl: requiredUrl('VITE_EXPLORER_URL'),
      multicall3: address('VITE_MULTICALL3_ADDRESS', CANONICAL_MULTICALL3),
      testnet: flag('VITE_TESTNET'),
    },
    faucetUrl: faucet === undefined ? null : url('VITE_FAUCET_URL', faucet),
    contracts: {
      launchFactory: address('VITE_LAUNCH_FACTORY_ADDRESS'),
      launchAndBuy: address('VITE_LAUNCH_AND_BUY_ADDRESS'),
      memeHook: address('VITE_MEME_HOOK_ADDRESS'),
      feeEscrow: address('VITE_FEE_ESCROW_ADDRESS'),
    },
    uniswap: {
      v4Quoter: address('VITE_V4_QUOTER_ADDRESS'),
      stateView: address('VITE_STATE_VIEW_ADDRESS'),
      universalRouter: address('VITE_UNIVERSAL_ROUTER_ADDRESS'),
      permit2: address('VITE_PERMIT2_ADDRESS', CANONICAL_PERMIT2),
    },
    quoteAssets: parseQuoteAssets(text('VITE_QUOTE_ASSETS'), errors),
    agentsEnabled: flag('VITE_AGENTS_ENABLED'),
  };

  return { env, errors };
}

function parseQuoteAssets(value: string | undefined, errors: string[]): QuoteAssetEnv[] {
  if (value === undefined) return [];
  const name = 'VITE_QUOTE_ASSETS';
  let entries: unknown;
  try {
    entries = JSON.parse(value);
  } catch {
    errors.push(`${name} must be a JSON array, and is not valid JSON.`);
    return [];
  }
  if (!Array.isArray(entries)) {
    errors.push(`${name} must be a JSON array.`);
    return [];
  }

  return entries.flatMap((entry: unknown, index): QuoteAssetEnv[] => {
    const at = `${name}[${index}]`;
    if (typeof entry !== 'object' || entry === null) {
      errors.push(`${at} must be an object.`);
      return [];
    }
    const { address, symbol, name: assetName, decimals, logo, mintable } = entry as Record<string, unknown>;
    const problems: string[] = [];
    if (typeof address !== 'string' || !isAddress(address, { strict: false }) || address === zeroAddress) {
      problems.push('"address" must be a non-zero 20-byte address');
    }
    if (typeof symbol !== 'string' || symbol === '') problems.push('"symbol" must be a non-empty string');
    if (typeof assetName !== 'string' || assetName === '') problems.push('"name" must be a non-empty string');
    if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
      problems.push('"decimals" must be an integer from 0 to 255');
    }
    if (logo !== undefined && typeof logo !== 'string') problems.push('"logo" must be a string');
    if (mintable !== undefined && typeof mintable !== 'boolean') problems.push('"mintable" must be true or false');
    if (problems.length > 0) {
      errors.push(`${at}: ${problems.join('; ')}.`);
      return [];
    }
    return [
      {
        address: getAddress(address as string),
        symbol: symbol as string,
        name: assetName as string,
        decimals: decimals as number,
        ...(typeof logo === 'string' ? { logo } : {}),
        ...(mintable === true ? { mintable } : {}),
      },
    ];
  });
}

const result = parseEnv(import.meta.env);

if (result.errors.length > 0) {
  console.error(`AI Launchpad is not configured. See .env.example.\n${result.errors.join('\n')}`);
}

/** The app's configuration. Placeholder values stand in wherever `envErrors` lists a problem. */
export const env = result.env;

/** Every problem with the `VITE_*` variables; the app renders these instead of itself when any. */
export const envErrors: readonly string[] = result.errors;
