import { describe, expect, it } from 'vitest';
import { contracts, pairedAssets, type PairedAsset } from '@/shared/config';
import { launchCost, planLaunch, type LaunchDraft, type LaunchTerms } from './launch-plan';

// `.env.test` pairs launches with ETH and one ERC-20, NVDA, a mintable test token.
const [eth, nvda] = pairedAssets as readonly [PairedAsset, PairedAsset];

const LAUNCHER = '0x1111111111111111111111111111111111111111';
const SALT = `0x${'ab'.repeat(32)}` as const;
const ECONOMICS = `0x${'cd'.repeat(32)}` as const;
const LOGO = 'https://abc123.ufs.sh/f/9f86d081884c7d659a2feaa0c55ad015.webp';

const terms: LaunchTerms = {
  launchFee: 500_000_000_000_000n, // 0.0005 ETH
  maxCreatorTaxBps: 1000,
  graduationThreshold: 4_200_000_000_000_000_000n, // 4.2 ETH
  expectedEconomics: ECONOMICS,
};

/** Terms for an NVDA pair: same launch fee, NVDA's own graduation amount. */
const nvdaTerms: LaunchTerms = { ...terms, graduationThreshold: 41_600_000_000_000_000_000n };

const form = (overrides: Partial<LaunchDraft> = {}): LaunchDraft => ({
  name: 'Moon Cat',
  ticker: 'MCAT',
  description: 'A cat on the moon',
  logo: LOGO,
  xHandle: '',
  telegram: '',
  pairedAsset: eth,
  developerBuy: '',
  buyback: true,
  creatorWallet: '',
  creatorTax: '',
  snipeExemptions: [],
  ...overrides,
});

const plan = (overrides: Partial<LaunchDraft> = {}, t: LaunchTerms = terms) =>
  planLaunch(form(overrides), t, { launcher: LAUNCHER, salt: SALT });

/** `count` distinct wallet addresses. */
const wallets = (count: number) =>
  Array.from({ length: count }, (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}` as const);

/** The TokenParams of a planned launch, the first argument on both launch paths. */
const tokenParams = (result: ReturnType<typeof planLaunch>) => {
  if (!result.ok) throw new Error('expected a launch plan, got errors');
  return result.transaction.args[0] as Record<string, unknown>;
};

describe('planLaunch', () => {
  it('launches an ETH-paired token through the factory, paying only the launch fee', () => {
    const result = plan();

    expect(result).toMatchObject({
      ok: true,
      approval: null,
      transaction: {
        address: contracts.launchFactory,
        functionName: 'launchToken',
        args: [
          {
            name: 'Moon Cat',
            symbol: 'MCAT',
            logo: LOGO,
            description: 'A cat on the moon',
            socials: { twitter: '', telegram: '', discord: '', website: '', farcaster: '' },
            creatorFeeRecipient: LAUNCHER,
            creatorTaxBps: 0,
            buybackEnabled: true,
            expectedEconomics: ECONOMICS,
            salt: SALT,
          },
          0n,
          '0x0000000000000000000000000000000000000000',
          [],
        ],
        value: 500_000_000_000_000n,
      },
    });
  });

  it('settles an ETH Developer buy in the launch transaction, paying the fee plus the buy', () => {
    const result = plan({ developerBuy: '0.25' });

    expect(result).toMatchObject({
      ok: true,
      approval: null,
      transaction: {
        address: contracts.launchAndBuy,
        functionName: 'launchAndBuy',
        args: [
          { creatorFeeRecipient: LAUNCHER },
          0n,
          '0x0000000000000000000000000000000000000000',
          250_000_000_000_000_000n, // quoteIn
          0n, // minTokensOut: nobody can trade ahead of it
          LAUNCHER, // receives the bought tokens
          [],
        ],
        value: 250_500_000_000_000_000n, // 0.2505 ETH
      },
    });
  });

  it('approves exactly the NVDA Developer buy to LaunchAndBuy, and pays only the launch fee in ETH', () => {
    const result = plan({ pairedAsset: nvda, developerBuy: '12.5' }, nvdaTerms);

    expect(result).toMatchObject({
      ok: true,
      approval: { token: nvda.address, spender: contracts.launchAndBuy, amount: 12_500_000_000_000_000_000n },
      transaction: {
        address: contracts.launchAndBuy,
        functionName: 'launchAndBuy',
        args: [{}, 0n, nvda.address, 12_500_000_000_000_000_000n, 0n, LAUNCHER, []],
        value: 500_000_000_000_000n,
      },
    });
  });

  it('writes the stored logo URL on chain as it was returned', () => {
    expect(tokenParams(plan())).toMatchObject({ logo: LOGO });
  });

  it('stores socials as full links, dropping a leading @ from the handle', () => {
    const result = plan({ xHandle: '@mooncat', telegram: 'mooncatchat' });

    expect(tokenParams(result).socials).toEqual({
      twitter: 'https://x.com/mooncat',
      telegram: 'https://t.me/mooncatchat',
      discord: '',
      website: '',
      farcaster: '',
    });
  });
});
describe('planLaunch: creator terms', () => {
  it('pays creator fees to the Creator wallet when one is given', () => {
    const creator = '0x2222222222222222222222222222222222222222';

    expect(tokenParams(plan({ creatorWallet: ` ${creator} ` })).creatorFeeRecipient).toBe(creator);
  });

  it('converts the Creator tax from percent to basis points', () => {
    expect(tokenParams(plan({ creatorTax: '2.5' })).creatorTaxBps).toBe(250);
  });
});

describe('launchCost', () => {
  it('is the launch fee, plus the Developer buy in its own asset', () => {
    expect(launchCost(form(), terms)).toEqual({ eth: 500_000_000_000_000n, paired: 0n });
    expect(launchCost(form({ developerBuy: '0.25' }), terms)).toEqual({ eth: 250_500_000_000_000_000n, paired: 0n });
    expect(launchCost(form({ pairedAsset: nvda, developerBuy: '12.5' }), nvdaTerms)).toEqual({
      eth: 500_000_000_000_000n,
      paired: 12_500_000_000_000_000_000n,
    });
  });

  it('leaves out a Developer buy that is not an amount', () => {
    expect(launchCost(form({ developerBuy: 'abc' }), terms)).toEqual({ eth: 500_000_000_000_000n, paired: 0n });
  });
});

describe('planLaunch: validation', () => {
  it('requires a logo', () => {
    expect(plan({ logo: '' })).toEqual({ ok: false, errors: { logo: 'Add a token image' } });
  });

  it('requires a name and a ticker', () => {
    expect(plan({ name: '  ', ticker: '' })).toEqual({
      ok: false,
      errors: { name: 'Enter a name', ticker: 'Enter a ticker' },
    });
  });

  it('limits the ticker to 16 bytes and the name to 64, so emoji count for what they cost on chain', () => {
    // 5 emoji are 5 characters but 20 bytes.
    const result = plan({ ticker: '🚀🚀🚀🚀🚀', name: 'n'.repeat(65) });

    expect(result).toEqual({
      ok: false,
      errors: { name: 'Keep the name to 64 bytes', ticker: 'Keep the ticker to 16 bytes' },
    });
    expect(plan({ ticker: '🚀🚀🚀🚀', name: 'n'.repeat(64) }).ok).toBe(true);
  });

  it('caps the Developer buy at the graduation amount, so it cannot buy out the whole curve', () => {
    expect(plan({ developerBuy: '4.21' })).toEqual({
      ok: false,
      errors: { developerBuy: 'At most 4.2 ETH, the graduation amount' },
    });
    expect(plan({ developerBuy: '4.2' }).ok).toBe(true);
  });

  it('keeps an ETH Developer buy within the balance left after the launch fee', () => {
    const balances = { eth: 1_000_000_000_000_000_000n, paired: 1_000_000_000_000_000_000n }; // 1 ETH

    expect(planLaunch(form({ developerBuy: '1' }), terms, { launcher: LAUNCHER, salt: SALT, balances })).toEqual({
      ok: false,
      errors: { developerBuy: 'Only 0.9995 ETH available after the launch fee' },
    });
    expect(planLaunch(form({ developerBuy: '0.9995' }), terms, { launcher: LAUNCHER, salt: SALT, balances }).ok).toBe(
      true,
    );
  });

  it('keeps an NVDA Developer buy within the NVDA balance', () => {
    const balances = { eth: 1_000_000_000_000_000_000n, paired: 3_000_000_000_000_000_000n }; // 3 NVDA

    expect(
      planLaunch(form({ pairedAsset: nvda, developerBuy: '3.5' }), nvdaTerms, {
        launcher: LAUNCHER,
        salt: SALT,
        balances,
      }),
    ).toEqual({ ok: false, errors: { developerBuy: 'Only 3 NVDA available' } });
  });

  it('needs enough ETH for the launch fee', () => {
    const balances = { eth: 100_000_000_000_000n, paired: 100_000_000_000_000n }; // 0.0001 ETH

    expect(planLaunch(form(), terms, { launcher: LAUNCHER, salt: SALT, balances })).toEqual({
      ok: false,
      errors: { launchFee: 'Not enough ETH for the 0.0005 ETH launch fee' },
    });
  });

  it('rejects a Developer buy that is not an amount', () => {
    for (const developerBuy of ['abc', '-1', '1.2.3', '0.0000000000000000001']) {
      expect(plan({ developerBuy })).toEqual({ ok: false, errors: { developerBuy: 'Enter an amount' } });
    }
  });

  it('rejects a Creator wallet that is not an address, including the zero address', () => {
    for (const creatorWallet of ['0x1234', '0x0000000000000000000000000000000000000000']) {
      expect(plan({ creatorWallet })).toEqual({ ok: false, errors: { creatorWallet: 'Enter a wallet address' } });
    }
  });

  it('keeps the Creator tax between 0% and the factory maximum, in steps of 0.01%', () => {
    for (const creatorTax of ['10.01', '11', 'abc', '1.005']) {
      expect(plan({ creatorTax })).toEqual({ ok: false, errors: { creatorTax: 'Enter 0% to 10%' } });
    }
    expect(tokenParams(plan({ creatorTax: '10' })).creatorTaxBps).toBe(1000);
  });

  it('allows 32 Snipe tax exemptions, or 31 with a Developer buy since the buyer takes a slot', () => {
    const withoutBuy = plan({ snipeExemptions: wallets(32) });
    expect(withoutBuy.ok && withoutBuy.transaction.args[3]).toEqual(wallets(32));
    expect(plan({ snipeExemptions: wallets(33) })).toEqual({
      ok: false,
      errors: { snipeExemptions: 'At most 32 wallets' },
    });

    expect(plan({ snipeExemptions: wallets(31), developerBuy: '1' }).ok).toBe(true);
    expect(plan({ snipeExemptions: wallets(32), developerBuy: '1' })).toEqual({
      ok: false,
      errors: { snipeExemptions: 'At most 31 wallets with a Developer buy' },
    });
  });
});
