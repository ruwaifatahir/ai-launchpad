import {
  formatUnits,
  getAddress,
  isAddress,
  isAddressEqual,
  parseUnits,
  zeroAddress,
  type Address,
  type ContractFunctionArgs,
  type Hex,
} from 'viem';
import { launchAndBuyAbi, launchFactoryAbi } from '@/shared/api';
import { contracts, isNativeAsset, LAUNCH_CONFIG_ID, supportedNetwork, type PairedAsset } from '@/shared/config';
import { FIELD_LIMITS } from '../config/field-limits';

/** What the creator filled in, as typed. */
export type LaunchDraft = {
  name: string;
  ticker: string;
  description: string;
  /** The stored logo's URL, as the API returned it; blank until one is uploaded. */
  logo: string;
  xHandle: string;
  telegram: string;
  pairedAsset: PairedAsset;
  /** Developer buy in the Paired asset, as a decimal; blank for none. */
  developerBuy: string;
  buyback: boolean;
  /** Blank means the launching wallet. */
  creatorWallet: string;
  /** Creator tax in percent; blank means 0. */
  creatorTax: string;
  snipeExemptions: Address[];
};

/** Protocol terms read from the factory for the chosen Paired asset. */
export type LaunchTerms = {
  launchFee: bigint;
  maxCreatorTaxBps: number;
  /** In the Paired asset's own units. */
  graduationThreshold: bigint;
  expectedEconomics: Hex;
};

export type LaunchPlan =
  { ok: true; approval: Approval | null; transaction: LaunchTransaction } | { ok: false; errors: LaunchErrors };

/** What is wrong with each field, or with paying the launch fee, in words for the creator. */
export type LaunchErrors = Partial<Record<keyof LaunchDraft | 'launchFee', string>>;

/** The launcher's balances in base units; `paired` repeats the ETH balance for an ETH pair. */
export type LaunchBalances = { eth: bigint; paired: bigint };

/** An ERC-20 allowance the launch transaction spends. */
export type Approval = { token: Address; spender: Address; amount: bigint };

/** The launch call, ready for `writeContract`. */
export type LaunchTransaction =
  | {
      address: Address;
      abi: typeof launchFactoryAbi;
      functionName: 'launchToken';
      args: ContractFunctionArgs<typeof launchFactoryAbi, 'payable', 'launchToken'>;
      value: bigint;
    }
  | {
      address: Address;
      abi: typeof launchAndBuyAbi;
      functionName: 'launchAndBuy';
      args: ContractFunctionArgs<typeof launchAndBuyAbi, 'payable', 'launchAndBuy'>;
      value: bigint;
    };

/** Socials are stored as full links, the form live Pons uses; a blank handle stays blank. */
function socialLink(base: string, handle: string): string {
  const name = handle.trim().replace(/^@/, '');
  return name ? `${base}${name}` : '';
}

/** The factory's cap on a launch's Snipe tax exemption list. */
const MAX_SNIPE_TAX_EXEMPTIONS = 32;

const utf8 = new TextEncoder();

/** The contract limits strings by UTF-8 bytes, so an emoji costs up to 4. */
const byteLength = (text: string) => utf8.encode(text).length;

/**
 * A typed decimal in base units, or `undefined` when it isn't one the asset can hold.
 * Blank is zero. Checked by hand because `parseUnits` rounds extra decimals instead of failing.
 */
function parseAmount(text: string, decimals: number): bigint | undefined {
  const value = text.trim();
  if (!value) return 0n;
  const match = /^(\d*)(?:\.(\d*))?$/.exec(value);
  if (!match || value === '.' || (match[2]?.length ?? 0) > decimals) return undefined;
  return parseUnits(value, decimals);
}

function validate(form: LaunchDraft, terms: LaunchTerms, balances: LaunchBalances | undefined): LaunchErrors {
  const errors: LaunchErrors = {};
  const asset = form.pairedAsset;
  const name = form.name.trim();
  const ticker = form.ticker.trim();

  if (!name) errors.name = 'Enter a name';
  else if (byteLength(name) > FIELD_LIMITS.name) errors.name = `Keep the name to ${FIELD_LIMITS.name} bytes`;

  if (!ticker) errors.ticker = 'Enter a ticker';
  else if (byteLength(ticker) > FIELD_LIMITS.ticker) errors.ticker = `Keep the ticker to ${FIELD_LIMITS.ticker} bytes`;

  if (!form.logo) errors.logo = 'Add a token image';

  const creatorWallet = form.creatorWallet.trim();
  // The zero address would burn creator fees, and LaunchAndBuy rejects it outright.
  if (creatorWallet && (!isAddress(creatorWallet) || isAddressEqual(creatorWallet, zeroAddress))) {
    errors.creatorWallet = 'Enter a wallet address';
  }

  // Percent with two decimals is exactly basis points.
  const creatorTaxBps = parseAmount(form.creatorTax, 2);
  if (creatorTaxBps === undefined || creatorTaxBps > BigInt(terms.maxCreatorTaxBps)) {
    errors.creatorTax = `Enter 0% to ${terms.maxCreatorTaxBps / 100}%`;
  }

  const developerBuy = parseAmount(form.developerBuy, asset.decimals);
  if (developerBuy === undefined) errors.developerBuy = 'Enter an amount';
  // A buy past the graduation amount would graduate the token in its launch transaction.
  else if (developerBuy > terms.graduationThreshold) {
    const cap = formatUnits(terms.graduationThreshold, asset.decimals);
    errors.developerBuy = `At most ${cap} ${asset.symbol}, the graduation amount`;
  }

  if (balances) {
    const native = isNativeAsset(asset);
    if (balances.eth < terms.launchFee) {
      const { symbol } = supportedNetwork.nativeCurrency;
      errors.launchFee = `Not enough ${symbol} for the ${formatUnits(terms.launchFee, 18)} ${symbol} launch fee`;
    }
    // An ETH buy shares the balance with the launch fee.
    const spendable = native ? balances.paired - terms.launchFee : balances.paired;
    if (!errors.developerBuy && developerBuy && developerBuy > spendable) {
      const available = `${formatUnits(spendable > 0n ? spendable : 0n, asset.decimals)} ${asset.symbol}`;
      errors.developerBuy = native ? `Only ${available} available after the launch fee` : `Only ${available} available`;
    }
  }

  // LaunchAndBuy adds the buyer to the list, so a Developer buy takes one of the factory's slots.
  const exemptionSlots = developerBuy ? MAX_SNIPE_TAX_EXEMPTIONS - 1 : MAX_SNIPE_TAX_EXEMPTIONS;
  if (form.snipeExemptions.length > exemptionSlots) {
    errors.snipeExemptions = developerBuy
      ? `At most ${exemptionSlots} wallets with a Developer buy`
      : `At most ${exemptionSlots} wallets`;
  }

  return errors;
}

/** The ETH the launch transaction carries: always the fee, plus the Developer buy when it is ETH too. */
function launchValue(asset: PairedAsset, terms: LaunchTerms, developerBuy: bigint): bigint {
  return isNativeAsset(asset) ? terms.launchFee + developerBuy : terms.launchFee;
}

/**
 * What the launch spends, in base units, whether or not the wallet can cover it.
 * `paired` is an ERC-20 Developer buy; an ETH buy is counted in `eth`.
 */
export function launchCost(draft: LaunchDraft, terms: LaunchTerms): { eth: bigint; paired: bigint } {
  const asset = draft.pairedAsset;
  const developerBuy = parseAmount(draft.developerBuy, asset.decimals) ?? 0n;
  return {
    eth: launchValue(asset, terms, developerBuy),
    paired: isNativeAsset(asset) ? 0n : developerBuy,
  };
}

/** Turns the form into the transactions that Launch it. */
export function planLaunch(
  form: LaunchDraft,
  terms: LaunchTerms,
  { launcher, salt, balances }: { launcher: Address; salt: Hex; balances?: LaunchBalances | undefined },
): LaunchPlan {
  const errors = validate(form, terms, balances);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const params = {
    name: form.name.trim(),
    symbol: form.ticker.trim(),
    logo: form.logo,
    description: form.description,
    socials: {
      twitter: socialLink('https://x.com/', form.xHandle),
      telegram: socialLink('https://t.me/', form.telegram),
      discord: '',
      website: '',
      farcaster: '',
    },
    creatorFeeRecipient: form.creatorWallet.trim() ? getAddress(form.creatorWallet.trim()) : launcher,
    creatorTaxBps: Number(parseAmount(form.creatorTax, 2) ?? 0n),
    buybackEnabled: form.buyback,
    expectedEconomics: terms.expectedEconomics,
    salt,
  };

  const pairToken = form.pairedAsset.address;
  const developerBuy = parseAmount(form.developerBuy, form.pairedAsset.decimals) ?? 0n;

  if (developerBuy > 0n) {
    const native = isNativeAsset(form.pairedAsset);
    return {
      ok: true,
      // LaunchAndBuy pulls an ERC-20 buy from the launcher, so it needs exactly that much allowance.
      approval: native ? null : { token: pairToken, spender: contracts.launchAndBuy, amount: developerBuy },
      transaction: {
        address: contracts.launchAndBuy,
        abi: launchAndBuyAbi,
        functionName: 'launchAndBuy',
        // minTokensOut is 0: the buy settles in the launch transaction, so nobody trades ahead of it.
        args: [params, LAUNCH_CONFIG_ID, pairToken, developerBuy, 0n, launcher, form.snipeExemptions],
        value: launchValue(form.pairedAsset, terms, developerBuy),
      },
    };
  }

  return {
    ok: true,
    approval: null,
    transaction: {
      address: contracts.launchFactory,
      abi: launchFactoryAbi,
      functionName: 'launchToken',
      args: [params, LAUNCH_CONFIG_ID, pairToken, form.snipeExemptions],
      value: terms.launchFee,
    },
  };
}
