import { formatUnits } from 'viem';
import { useReadContracts } from 'wagmi';
import { launchFactoryAbi } from '@/shared/api';
import { contracts, isNativeAsset, LAUNCH_CONFIG_ID, supportedNetwork, type PairedAsset } from '@/shared/config';
import type { LaunchTerms } from './launch-plan';

/** The terms, worded for the form notes and the preview. */
export type LaunchTermsText = {
  launchFeeEth: string;
  tradeFee: string;
  maxCreatorTax: string;
  snipeTax: string;
  snipeWindowSeconds: string;
  graduation: string;
};

const factory = { address: contracts.launchFactory, abi: launchFactoryAbi, chainId: supportedNetwork.id } as const;

const percent = (bps: bigint | number) => `${Number(bps) / 100}%`;

/**
 * The protocol terms a launch against `asset` would lock in, read from the factory.
 * `undefined` until every read has arrived.
 */
export function useLaunchTerms(asset: PairedAsset): {
  terms: LaunchTerms | undefined;
  text: LaunchTermsText | undefined;
} {
  const { data } = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...factory, functionName: 'launchFee' },
      { ...factory, functionName: 'maxCreatorTaxBps' },
      { ...factory, functionName: 'snipeTaxStartBps' },
      { ...factory, functionName: 'snipeTaxSeconds' },
      { ...factory, functionName: 'getLaunchConfig', args: [LAUNCH_CONFIG_ID] },
      { ...factory, functionName: 'pairTokenEconomics', args: [asset.address] },
      { ...factory, functionName: 'previewLaunchEconomics', args: [LAUNCH_CONFIG_ID, asset.address] },
    ],
  });

  if (!data) return { terms: undefined, text: undefined };

  const [launchFee, maxCreatorTaxBps, snipeTaxStartBps, snipeTaxSeconds, config, pairEconomics, expectedEconomics] =
    data;
  // Native launches graduate on the preset's threshold; an ERC-20 pair carries its own, in its own decimals.
  const graduationThreshold = isNativeAsset(asset) ? config.graduationThreshold : pairEconomics[1];

  return {
    terms: {
      launchFee,
      maxCreatorTaxBps: Number(maxCreatorTaxBps),
      graduationThreshold,
      expectedEconomics,
    },
    text: {
      launchFeeEth: formatUnits(launchFee, 18),
      tradeFee: percent(config.curveFeeBps),
      maxCreatorTax: percent(maxCreatorTaxBps),
      snipeTax: percent(snipeTaxStartBps),
      snipeWindowSeconds: snipeTaxSeconds.toString(),
      graduation: `${formatUnits(graduationThreshold, asset.decimals)} ${asset.symbol}`,
    },
  };
}
