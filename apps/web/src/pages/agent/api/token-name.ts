import type { Address } from 'viem';
import { useReadContracts } from 'wagmi';
import { webLink } from '@/entities/token';
import { launchedTokenAbi } from '@/shared/api';
import { supportedNetwork } from '@/shared/config';

export type TokenName = { name: string; symbol: string; logo: string | null };

/** The name, symbol and logo the token was launched with, which never change. `undefined` until read. */
export function useTokenName(token: Address): TokenName | undefined {
  const contract = { address: token, abi: launchedTokenAbi, chainId: supportedNetwork.id } as const;
  const { data } = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...contract, functionName: 'name' },
      { ...contract, functionName: 'symbol' },
      { ...contract, functionName: 'logo' },
    ],
    query: { staleTime: Infinity },
  });
  if (!data) return undefined;
  const [name, symbol, logo] = data;
  return { name, symbol, logo: webLink(logo) };
}
