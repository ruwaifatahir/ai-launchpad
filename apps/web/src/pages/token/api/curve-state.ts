import type { Address } from 'viem';
import { useReadContracts } from 'wagmi';
import { bondingCurveAbi } from '@/shared/api';
import { supportedNetwork } from '@/shared/config';
import { REFRESH_MS } from '../config/refresh';

/** What the Bonding curve holds and charges, read once for the market stats and the trade card alike. */
export type CurveState = {
  /** `getReserves()`: the phantom reserve included, pending fees excluded. */
  quoteReserve: bigint;
  tokenReserve: bigint;
  /** The Paired asset actually raised so far. */
  realQuoteReserve: bigint;
  /** The Paired asset the curve must raise to sell out. */
  graduationThreshold: bigint;
  /** Tokens left before the curve sells out. */
  sellableTokens: bigint;
  feeBps: number;
  creatorTaxBps: number;
};

/**
 * The curve's reserves, progress and taxes, while `enabled`. `undefined` until the first read
 * lands; a failed refresh keeps the last good read.
 */
export function useCurveState(curve: Address, enabled: boolean): CurveState | undefined {
  const contract = { address: curve, abi: bondingCurveAbi, chainId: supportedNetwork.id } as const;
  const { data } = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...contract, functionName: 'getReserves' },
      { ...contract, functionName: 'realQuoteReserve' },
      { ...contract, functionName: 'graduationThreshold' },
      { ...contract, functionName: 'sellableTokens' },
      { ...contract, functionName: 'feeBps' },
      { ...contract, functionName: 'creatorTaxBps' },
    ],
    query: { enabled, refetchInterval: REFRESH_MS },
  });
  if (!data) return undefined;
  const [[quoteReserve, tokenReserve], realQuoteReserve, graduationThreshold, sellableTokens, feeBps, creatorTaxBps] =
    data;
  return {
    quoteReserve,
    tokenReserve,
    realQuoteReserve,
    graduationThreshold,
    sellableTokens,
    feeBps: Number(feeBps),
    creatorTaxBps: Number(creatorTaxBps),
  };
}
