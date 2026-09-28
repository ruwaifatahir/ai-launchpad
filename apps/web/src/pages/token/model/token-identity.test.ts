import { describe, expect, it } from 'vitest';
import { pairedAssets, type PairedAsset } from '@/shared/config';
import { tokenIdentity, type TokenReads } from './token-identity';

// `.env.test` pairs launches with ETH and one ERC-20, NVDA, a mintable test token.
const [eth, nvda] = pairedAssets as readonly [PairedAsset, PairedAsset];

const TOKEN = '0xA92d2c66716C216A7a7a4fFa0b953167A2bf4cbB';
const DEPLOYER = '0xdC03170A1357DfeD75513Cb972bC6baAf57556E6';
const RECIPIENT = '0x2222222222222222222222222222222222222222';

const reads = (overrides: Partial<TokenReads> = {}): TokenReads => ({
  launch: {
    token: TOKEN,
    deployer: DEPLOYER,
    creatorFeeRecipient: RECIPIENT,
    pairToken: eth.address,
    creatorTaxBps: 80,
  },
  name: 'Test Meme',
  symbol: 'TMEME',
  decimals: 18,
  totalSupply: 1_000_000_000n * 10n ** 18n,
  logo: '',
  description: 'A test meme',
  socials: ['', '', '', '', ''],
  ...overrides,
});

describe('tokenIdentity', () => {
  it('names the token, its launcher and its Creator tax from the chain', () => {
    expect(tokenIdentity(reads())).toMatchObject({
      address: TOKEN,
      name: 'Test Meme',
      symbol: 'TMEME',
      description: 'A test meme',
      creator: DEPLOYER,
      creatorWallet: RECIPIENT,
      creatorTax: '0.80%',
      supply: '1,000,000,000',
    });
  });

  it('shows the Paired asset of the launch', () => {
    expect(tokenIdentity(reads()).pair).toEqual({ address: eth.address, symbol: 'ETH', name: 'Ether', decimals: 18 });
    const nvdaLaunch = reads({ launch: { ...reads().launch, pairToken: nvda.address.toLowerCase() as `0x${string}` } });
    expect(tokenIdentity(nvdaLaunch).pair).toEqual({
      address: nvda.address,
      symbol: 'NVDA',
      name: 'NVIDIA (test)',
      decimals: 18,
    });
  });

  it('links only the socials the creator set, in a fixed order', () => {
    const identity = tokenIdentity(
      reads({ socials: ['https://x.com/tmeme', '', 'https://discord.gg/tmeme', ' ', 'https://warpcast.com/tmeme'] }),
    );

    expect(identity.socials).toEqual([
      { label: 'Twitter', href: 'https://x.com/tmeme' },
      { label: 'Discord', href: 'https://discord.gg/tmeme' },
      { label: 'Farcaster', href: 'https://warpcast.com/tmeme' },
    ]);
  });

  it('drops socials and logos that are not web links, so chain data cannot inject a script link', () => {
    const identity = tokenIdentity(
      reads({ logo: 'javascript:alert(1)', socials: ['javascript:alert(1)', 'not a url', '', 'http://tmeme.xyz', ''] }),
    );

    expect(identity.socials).toEqual([{ label: 'Website', href: 'http://tmeme.xyz' }]);
    expect(identity.logo).toBeNull();
  });

  it('has no logo when none was set', () => {
    expect(tokenIdentity(reads()).logo).toBeNull();
    expect(tokenIdentity(reads({ logo: 'https://example.com/logo.png' })).logo).toBe('https://example.com/logo.png');
  });
});
