import { useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useBalance, useReadContract } from 'wagmi';
import { formatBalance, useConnectedAddress } from '@/features/connect-wallet';
import { mockStockTokenAbi } from '@/shared/api';
import { isNativeAsset, supportedNetwork, type PairedAsset } from '@/shared/config';
import {
  describeTransactionError,
  isUserRejection,
  sendInOrder,
  useSingleFlight,
  useTransactionSender,
} from '@/shared/lib';
import { toast } from '@/shared/ui/toast';
import type { LaunchBalances } from './launch-plan';

/** How much a "Get test" click mints: enough to cover a Developer buy up to a typical graduation amount. */
const TEST_MINT_AMOUNT = '100';

/**
 * The Connected wallet's ETH and Paired asset balances.
 * `balances` is `undefined` until both are known; `amount` is the Paired asset's, ready to display.
 */
export function usePairedAssetBalance(asset: PairedAsset) {
  const address = useConnectedAddress();
  const native = isNativeAsset(asset);
  const chainId = supportedNetwork.id;
  const eth = useBalance({ address, chainId, query: { enabled: Boolean(address) } });
  const token = useReadContract({
    address: asset.address,
    abi: mockStockTokenAbi,
    functionName: 'balanceOf',
    args: address && [address],
    chainId,
    query: { enabled: Boolean(address) && !native },
  });

  const paired = native ? eth.data?.value : token.data;
  const balances: LaunchBalances | undefined =
    address && eth.data && paired !== undefined ? { eth: eth.data.value, paired } : undefined;
  const amount = paired === undefined ? undefined : formatBalance(formatUnits(paired, asset.decimals), asset.symbol);

  return {
    amount,
    balances,
    refetch: () => {
      void eth.refetch();
      if (!native) void token.refetch();
    },
  };
}

/** Mints test units of a mintable test token to the Connected wallet. */
export function useMintTestAsset(asset: PairedAsset, onMinted: () => void) {
  const address = useConnectedAddress();
  const sender = useTransactionSender();
  const singleFlight = useSingleFlight();
  const [minting, setMinting] = useState(false);
  const amount = `${TEST_MINT_AMOUNT} ${asset.symbol}`;

  const mint = () =>
    singleFlight(async () => {
      if (!address || !asset.mintable) return;
      setMinting(true);
      try {
        const call = {
          address: asset.address,
          abi: mockStockTokenAbi,
          functionName: 'mint',
          args: [address, parseUnits(TEST_MINT_AMOUNT, asset.decimals)],
        } as const;
        await sendInOrder(sender, [call], { revertMessage: () => `The ${asset.symbol} mint reverted` });
        onMinted();
        toast.success({ title: `Got ${amount}`, description: 'Test tokens for the Developer buy.' });
      } catch (error) {
        if (!isUserRejection(error)) {
          toast.error({ title: `Couldn't get ${amount}`, description: describeTransactionError(error) });
        }
      } finally {
        setMinting(false);
      }
    });

  return { mint, minting, amount };
}
