import { formatUnits, isAddressEqual, type Address } from 'viem';
import { pairedAssets } from '@/shared/config';
import { webLink } from '@/entities/token';
import { shortenAddress } from '@/shared/lib';

/** The token's own socials, in the order the contract returns them. */
const SOCIAL_LABELS = ['Twitter', 'Telegram', 'Discord', 'Website', 'Farcaster'] as const;

/** What the Token page reads from the chain to name a token. */
export type TokenReads = {
  /** The slice of the factory's launch record the identity needs. */
  launch: {
    token: Address;
    deployer: Address;
    creatorFeeRecipient: Address;
    pairToken: Address;
    creatorTaxBps: number;
  };
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  logo: string;
  description: string;
  /** Twitter, Telegram, Discord, website, Farcaster; empty when not set. */
  socials: readonly [string, string, string, string, string];
};

/** A launched token's identity, ready to display. */
export type TokenIdentity = {
  address: Address;
  name: string;
  symbol: string;
  /** `null` when the creator set none, or set something that is not a web link. */
  logo: string | null;
  decimals: number;
  pair: { address: Address; symbol: string; name: string; decimals: number };
  description: string;
  /** The wallet that launched the token. */
  creator: Address;
  /** The Creator wallet, which receives the creator fees. */
  creatorWallet: Address;
  creatorTax: string;
  supply: string;
  socials: { label: (typeof SOCIAL_LABELS)[number]; href: string }[];
};

function pairedAssetOf(address: Address): TokenIdentity['pair'] {
  const asset = pairedAssets.find((candidate) => isAddressEqual(candidate.address, address));
  if (asset) return { address: asset.address, symbol: asset.symbol, name: asset.name, decimals: asset.decimals };
  // The factory only launches against approved Paired assets, all of which use 18 decimals.
  return { address, symbol: shortenAddress(address), name: address, decimals: 18 };
}

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function tokenIdentity(reads: TokenReads): TokenIdentity {
  const socials = reads.socials.flatMap((value, index) => {
    const href = webLink(value);
    return href ? [{ label: SOCIAL_LABELS[index]!, href }] : [];
  });

  return {
    address: reads.launch.token,
    name: reads.name,
    symbol: reads.symbol,
    decimals: reads.decimals,
    logo: webLink(reads.logo),
    pair: pairedAssetOf(reads.launch.pairToken),
    description: reads.description,
    creator: reads.launch.deployer,
    creatorWallet: reads.launch.creatorFeeRecipient,
    creatorTax: `${(reads.launch.creatorTaxBps / 100).toFixed(2)}%`,
    supply: wholeNumber.format(Number(formatUnits(reads.totalSupply, reads.decimals))),
    socials,
  };
}
