import { isAddressEqual, zeroAddress, type Address } from 'viem';
import { env } from './env';
import { assetUrls } from './external-links';

export type PairedAsset = {
  /** `zeroAddress` for the native asset, which the contracts treat as `address(0)`. */
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Icon path or URL; unset falls back to `/pairs/<symbol>.svg`. */
  logo?: string;
  /** A test token with a public `mint` anyone can call for themselves. */
  mintable?: boolean;
};

/**
 * The Paired assets a launch can choose from: the native asset, then any ERC-20s in
 * `VITE_QUOTE_ASSETS`. The factory can only say whether one address is approved, not list them
 * all, so the list is configured.
 */
export const pairedAssets: readonly [PairedAsset, ...PairedAsset[]] = [
  { address: zeroAddress, ...env.chain.nativeCurrency, decimals: 18 },
  ...env.quoteAssets,
];

export const isNativeAsset = (asset: Pick<PairedAsset, 'address'>) => asset.address === zeroAddress;

export const pairedAssetIcon = (asset: Pick<PairedAsset, 'address' | 'symbol'>) => {
  if (isNativeAsset(asset)) return assetUrls.native;
  const configured = pairedAssets.find((candidate) => isAddressEqual(candidate.address, asset.address));
  return configured?.logo ?? assetUrls.pair(asset.symbol);
};
