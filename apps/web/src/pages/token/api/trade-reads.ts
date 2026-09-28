import { erc20Abi, zeroAddress, type Address } from 'viem';
import { useBalance, useReadContract, useReadContracts } from 'wagmi';
import { bondingCurveAbi, permit2Abi } from '@/shared/api';
import { isNativeAsset, supportedNetwork, uniswap } from '@/shared/config';
import type { TokenIdentity } from '../model/token-identity';
import type { TokenStage } from '../model/token-stage';
import type { CurveTerms, Permit2Allowance, Permit2Allowances, TradeAmounts } from '../model/trade-plan';
import { REFRESH_MS } from '../config/refresh';
import type { CurveState } from './curve-state';
import type { LaunchRecord } from '@/entities/token';

const chainId = supportedNetwork.id;

export type TradeReads = {
  /** `null` off the Bonding curve, and until the first read lands. */
  curve: CurveTerms | null;
  /** The wallet's Paired asset and token balances; `undefined` while disconnected or loading. */
  balances: TradeAmounts | undefined;
  /**
   * What the wallet lets the market pull of each asset: the curve on the Bonding curve, Permit2 in
   * the Pool. `undefined` while disconnected or loading. ETH is sent as value and needs no
   * allowance, so its entry is always zero.
   */
  allowances: TradeAmounts | undefined;
  /**
   * In the Pool, what Permit2 lets the UniversalRouter pull of each asset; `undefined` off the
   * Pool, while disconnected or loading. ETH's entry is always zero.
   */
  permit2Allowances: Permit2Allowances | undefined;
};

const NO_PERMIT2_ALLOWANCE: Permit2Allowance = { amount: 0n, expiration: 0 };

/** Permit2's `allowance` answer, less the nonce, which only signed permits use. */
const toPermit2Allowance = ([amount, expiration]: readonly [bigint, number, number]): Permit2Allowance => ({
  amount,
  expiration,
});

/**
 * What a trade is priced against, for `wallet`. On the Bonding curve: the page's `curveState` and
 * the wallet's Snipe tax; without a wallet, the Snipe tax a wallet with no exemption would pay.
 * Plus the wallet's balances of the Paired asset and the token, what it has approved the market to
 * spend of each and, in the Pool, what Permit2 lets the router spend.
 */
export function useTradeReads(
  launch: LaunchRecord,
  pair: TokenIdentity['pair'],
  stage: TokenStage['kind'],
  curveState: CurveState | null,
  wallet: Address | undefined,
): TradeReads {
  const onBondingCurve = stage === 'bonding-curve';
  const onPool = stage === 'pool';
  const snipeTax = useReadContract({
    address: launch.curve,
    abi: bondingCurveAbi,
    functionName: 'currentSnipeTaxBps',
    args: [wallet ?? zeroAddress],
    chainId,
    query: { enabled: onBondingCurve, refetchInterval: REFRESH_MS },
  });

  const native = isNativeAsset(pair);
  const owner = wallet ?? zeroAddress;
  // The Pool's router pulls ERC-20 input through Permit2, so that is what the wallet approves.
  const spender = onPool ? uniswap.permit2 : launch.curve;
  const walletQuery = { enabled: Boolean(wallet), refetchInterval: REFRESH_MS };
  const balanceAndAllowanceCalls = (address: Address) =>
    [
      { address, abi: erc20Abi, chainId, functionName: 'balanceOf', args: [owner] },
      { address, abi: erc20Abi, chainId, functionName: 'allowance', args: [owner, spender] },
    ] as const;
  const token = useReadContracts({
    allowFailure: false,
    contracts: balanceAndAllowanceCalls(launch.token),
    query: walletQuery,
  });
  const erc20Pair = useReadContracts({
    allowFailure: false,
    contracts: balanceAndAllowanceCalls(pair.address),
    query: { ...walletQuery, enabled: walletQuery.enabled && !native },
  });
  const eth = useBalance({
    address: wallet,
    chainId,
    query: { ...walletQuery, enabled: walletQuery.enabled && native },
  });
  const permit2Allowance = (asset: Address) =>
    ({
      address: uniswap.permit2,
      abi: permit2Abi,
      chainId,
      functionName: 'allowance',
      args: [owner, asset, uniswap.universalRouter],
    }) as const;
  const permit2 = useReadContracts({
    allowFailure: false,
    contracts: [permit2Allowance(pair.address), permit2Allowance(launch.token)],
    query: { ...walletQuery, enabled: walletQuery.enabled && onPool },
  });

  // ETH is sent as value, so it needs no allowance.
  const paired = native
    ? eth.data && { balance: eth.data.value, allowance: 0n }
    : erc20Pair.data && { balance: erc20Pair.data[0], allowance: erc20Pair.data[1] };
  const held = wallet && token.data && paired ? { token: token.data, paired } : undefined;

  // A failed refresh keeps pricing against the last good read.
  const snipeTaxBps = onBondingCurve ? snipeTax.data : undefined;
  return {
    curve:
      curveState && snipeTaxBps !== undefined
        ? {
            address: launch.curve,
            quoteReserve: curveState.quoteReserve,
            tokenReserve: curveState.tokenReserve,
            sellableTokens: curveState.sellableTokens,
            feeBps: curveState.feeBps,
            creatorTaxBps: curveState.creatorTaxBps,
            snipeTaxBps: Number(snipeTaxBps),
          }
        : null,
    balances: held && { paired: held.paired.balance, token: held.token[0] },
    allowances: held && { paired: held.paired.allowance, token: held.token[1] },
    permit2Allowances:
      wallet && onPool && permit2.data
        ? {
            paired: native ? NO_PERMIT2_ALLOWANCE : toPermit2Allowance(permit2.data[0]),
            token: toPermit2Allowance(permit2.data[1]),
          }
        : undefined,
  };
}
