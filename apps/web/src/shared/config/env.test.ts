import { getAddress, zeroAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const VALID = {
  VITE_API_URL: 'https://api.example.org/',
  VITE_CHAIN_ID: '1337',
  VITE_CHAIN_NAME: 'Example Chain',
  VITE_RPC_URL: 'https://rpc.example.org',
  VITE_NATIVE_CURRENCY_NAME: 'Ether',
  VITE_NATIVE_CURRENCY_SYMBOL: 'ETH',
  VITE_EXPLORER_URL: 'https://explorer.example.org/',
  VITE_LAUNCH_FACTORY_ADDRESS: '0x0000000000000000000000000000000000000001',
  VITE_LAUNCH_AND_BUY_ADDRESS: '0x0000000000000000000000000000000000000002',
  VITE_MEME_HOOK_ADDRESS: '0x0000000000000000000000000000000000000003',
  VITE_FEE_ESCROW_ADDRESS: '0x0000000000000000000000000000000000000004',
  VITE_V4_QUOTER_ADDRESS: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',
  VITE_STATE_VIEW_ADDRESS: '0x0000000000000000000000000000000000000006',
  VITE_UNIVERSAL_ROUTER_ADDRESS: '0x0000000000000000000000000000000000000007',
};

const USDC = { address: '0x00000000000000000000000000000000000000aa', symbol: 'USDC', name: 'USD Coin', decimals: 6 };

describe('parseEnv', () => {
  it('reads a complete configuration without errors, with the optional parts at their defaults', () => {
    const { env, errors } = parseEnv(VALID);
    expect(errors).toEqual([]);
    expect(env.apiUrl).toBe('https://api.example.org');
    expect(env.chain).toMatchObject({ id: 1337, rpcUrls: ['https://rpc.example.org'], testnet: false });
    expect(env.chain.explorerUrl).toBe('https://explorer.example.org');
    expect(env.faucetUrl).toBeNull();
    expect(env.uniswap.permit2).toBe('0x000000000022D473030F116dDEE9F6B43aC78BA3');
    // Checksummed, whatever case the variable was written in.
    expect(env.uniswap.v4Quoter).toBe(getAddress(VALID.VITE_V4_QUOTER_ADDRESS));
    expect(env.quoteAssets).toEqual([]);
    expect(env.agentsEnabled).toBe(false);
  });

  it('names every missing required variable', () => {
    const { errors } = parseEnv({});
    for (const name of Object.keys(VALID)) expect(errors).toContain(`${name} is not set.`);
  });

  it('rejects a malformed chain ID, URL and address', () => {
    const { errors } = parseEnv({
      ...VALID,
      VITE_CHAIN_ID: 'robin',
      VITE_RPC_URL: 'rpc.example.org',
      VITE_MEME_HOOK_ADDRESS: '0x1234',
    });
    expect(errors).toEqual([
      'VITE_CHAIN_ID must be a positive integer, got "robin".',
      'VITE_RPC_URL must be an http(s) URL, got "rpc.example.org".',
      'VITE_MEME_HOOK_ADDRESS must be a 0x-prefixed 20-byte address, got "0x1234".',
    ]);
  });

  it('reads ERC-20 quote assets from JSON, and says which entry is wrong', () => {
    const good = parseEnv({ ...VALID, VITE_QUOTE_ASSETS: JSON.stringify([{ ...USDC, logo: '/pairs/usdc.svg' }]) });
    expect(good.errors).toEqual([]);
    expect(good.env.quoteAssets).toEqual([
      { ...USDC, address: '0x00000000000000000000000000000000000000AA', logo: '/pairs/usdc.svg' },
    ]);

    const bad = parseEnv({ ...VALID, VITE_QUOTE_ASSETS: JSON.stringify([USDC, { ...USDC, address: zeroAddress }]) });
    expect(bad.errors).toEqual(['VITE_QUOTE_ASSETS[1]: "address" must be a non-zero 20-byte address.']);
    expect(parseEnv({ ...VALID, VITE_QUOTE_ASSETS: '[{' }).errors).toEqual([
      'VITE_QUOTE_ASSETS must be a JSON array, and is not valid JSON.',
    ]);
  });
});

describe('VITE_AGENTS_ENABLED', () => {
  it('is off when unset, empty or "false"', () => {
    expect(parseEnv(VALID).env.agentsEnabled).toBe(false);
    expect(parseEnv({ ...VALID, VITE_AGENTS_ENABLED: '' }).env.agentsEnabled).toBe(false);
    expect(parseEnv({ ...VALID, VITE_AGENTS_ENABLED: 'false' }).env.agentsEnabled).toBe(false);
  });

  it('is on only for "true"', () => {
    expect(parseEnv({ ...VALID, VITE_AGENTS_ENABLED: 'true' })).toMatchObject({
      env: { agentsEnabled: true },
      errors: [],
    });
  });

  it('refuses anything else rather than guess, and stays off', () => {
    expect(parseEnv({ ...VALID, VITE_AGENTS_ENABLED: 'yes' })).toMatchObject({
      env: { agentsEnabled: false },
      errors: ['VITE_AGENTS_ENABLED must be "true" or "false", got "yes".'],
    });
  });
});
