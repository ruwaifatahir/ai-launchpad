import { useReadContract, useReadContracts } from 'wagmi';
import { GraduationPhase, type LaunchRecord, type Loadable } from '@/entities/token';
import { bondingCurveAbi, launchedTokenAbi, stateViewAbi } from '@/shared/api';
import { supportedNetwork, uniswap } from '@/shared/config';
import { REFRESH_MS } from '../config/refresh';
import { curveMarket, type CurveMarket } from '../model/curve-market';
import { poolMarket, type PoolMarket } from '../model/pool-market';
import { tokenIdentity, type TokenIdentity } from '../model/token-identity';
import { tokenStage, type TokenStage } from '../model/token-stage';
import { isZeroForOne, poolId, poolKey } from '../model/uniswap-pool';
import { useCurveState, type CurveState } from './curve-state';

const chainId = supportedNetwork.id;

export type LaunchedToken = {
  identity: TokenIdentity;
  stage: Exclude<TokenStage, { kind: 'not-found' }>;
  /**
   * The Bonding curve's reserves and taxes, which the trade card prices against. Only read on the
   * Bonding curve stage; `null` there until the first read lands.
   */
  curveState: CurveState | null;
  /** The Bonding curve's price, market cap and Graduation progress, from `curveState`. */
  curve: CurveMarket | null;
  /** The Pool's price and market cap. Only read on the Pool stage; `null` there until the first read lands. */
  pool: PoolMarket | null;
};

/**
 * A launched token's identity and stage, read from the token and its curve. The market reads start
 * alongside them, on the launch record's phase, so the page waits on one round trip, not two.
 */
export function useLaunchedToken(launch: LaunchRecord): Loadable<LaunchedToken> {
  const token = { address: launch.token, abi: launchedTokenAbi, chainId } as const;
  // Set once at Launch and never changed.
  const metadata = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...token, functionName: 'name' },
      { ...token, functionName: 'symbol' },
      { ...token, functionName: 'decimals' },
      { ...token, functionName: 'logo' },
      { ...token, functionName: 'description' },
      { ...token, functionName: 'socials' },
    ],
    query: { staleTime: Infinity },
  });
  const live = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...token, functionName: 'totalSupply' },
      { address: launch.curve, abi: bondingCurveAbi, functionName: 'readyToGraduate', chainId },
    ],
    query: { refetchInterval: REFRESH_MS },
  });
  const curveState = useCurveState(launch.curve, launch.phase === GraduationPhase.NotGraduated);
  const key = poolKey(launch);
  const slot0 = useReadContract({
    address: uniswap.stateView,
    abi: stateViewAbi,
    functionName: 'getSlot0',
    args: [poolId(key)],
    chainId,
    query: { enabled: launch.phase === GraduationPhase.PoolCreated, refetchInterval: REFRESH_MS },
  });

  if (metadata.data && live.data) {
    const [name, symbol, decimals, logo, description, socials] = metadata.data;
    const [totalSupply, curveSoldOut] = live.data;
    const stage = tokenStage(launch, curveSoldOut);
    if (stage.kind === 'not-found') throw new Error('A launch record that exists has a stage');
    const identity = tokenIdentity({
      launch,
      name,
      symbol,
      decimals,
      totalSupply,
      logo,
      description,
      socials,
    });
    // A failed refresh keeps showing the last good numbers.
    const onCurve = stage.kind === 'bonding-curve' && curveState ? curveState : null;
    const sqrtPriceX96 = stage.kind === 'pool' ? slot0.data?.[0] : undefined;
    return {
      status: 'ready',
      identity,
      stage,
      curveState: onCurve,
      curve: onCurve
        ? curveMarket({
            ...onCurve,
            totalSupply,
            tokenDecimals: decimals,
            pairDecimals: identity.pair.decimals,
          })
        : null,
      pool:
        sqrtPriceX96 === undefined
          ? null
          : poolMarket({
              sqrtPriceX96,
              tokenIsCurrency0: isZeroForOne(key, launch.token),
              totalSupply,
              tokenDecimals: decimals,
              pairDecimals: identity.pair.decimals,
            }),
    };
  }
  if (metadata.isError || live.isError) {
    return {
      status: 'error',
      retry: () => {
        if (metadata.isError) void metadata.refetch();
        if (live.isError) void live.refetch();
      },
    };
  }
  return { status: 'loading' };
}
