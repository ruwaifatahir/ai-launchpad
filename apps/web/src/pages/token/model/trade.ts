import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatUnits } from 'viem';
import { useConnectedAddress } from '@/features/connect-wallet';
import { externalLinks, isNativeAsset } from '@/shared/config';
import {
  describeTransactionError,
  invalidateChainReads,
  isUserRejection,
  sendInOrder,
  useSingleFlight,
  useTransactionSender,
  type TransactionStage,
} from '@/shared/lib';
import { toast } from '@/shared/ui/toast';
import { usePoolQuote } from '../api/pool-quote';
import {
  parseAmount,
  planTrade,
  quoteTrade,
  tradeStep,
  type TradeAmounts,
  type TradeMarket,
  type TradeQuoteResult,
  type TradeRequest,
  type TradeSide,
  type TradeStep,
  type TradeTransaction,
} from './trade-plan';

/** Where a trade is: each wallet request is signed, then waited on. */
export type TradeStatus = { kind: 'idle' } | { kind: TransactionStage; step: TradeStep };

export type Trade = {
  side: TradeSide;
  /** Switches between buying and selling, clearing the amount since it was in the other asset. */
  flip: () => void;
  amount: string;
  setAmount: (amount: string) => void;
  /** Fills in the whole balance of the asset spent; `undefined` for ETH, which has to leave gas. */
  fillMax: (() => void) | undefined;
  /** The typed trade's quote, or why it can't be made. */
  preview: TradeQuoteResult;
  status: TradeStatus;
  submit: () => Promise<void>;
};

/** The wallet's balances and allowances; `undefined` while disconnected or loading. */
export type TradeHoldings = {
  balances: TradeAmounts | undefined;
  allowances: TradeAmounts | undefined;
  /** Only read in the Pool. */
  permit2Allowances: TradeRequest['permit2Allowances'];
};

const idle: TradeStatus = { kind: 'idle' };

const unixNow = () => Math.floor(Date.now() / 1000);

/** Why a transaction that was mined didn't go through, for the failure toast. */
function revertMessage(transaction: TradeTransaction, side: TradeSide, spentSymbol: string): string {
  switch (tradeStep(transaction)) {
    case 'approve':
      return `The ${spentSymbol} approval reverted`;
    case 'permit2':
      return 'The Permit2 approval reverted';
    case 'trade':
      return `The ${side} reverted`;
  }
}

/**
 * A buy or sell as the user types it, and sending it from the Connected wallet: any exact
 * approvals the market needs first, then the trade. In the Pool the typed amount is quoted by the
 * V4Quoter as it changes. Once a trade settles, every chain read on the page refreshes: balances,
 * allowances, price, progress and stage.
 */
export function useTrade(market: TradeMarket, holdings: TradeHoldings): Trade {
  const queryClient = useQueryClient();
  const wallet = useConnectedAddress();
  const sender = useTransactionSender();
  const singleFlight = useSingleFlight();
  const [side, setSide] = useState<TradeSide>('buy');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<TradeStatus>(idle);

  const { balances, allowances, permit2Allowances } = holdings;
  const spent = side === 'buy' ? market.pair : market.token;
  const spentBalance = balances?.[side === 'buy' ? 'paired' : 'token'];
  const poolQuote = usePoolQuote(market.pool, side, spent.address, parseAmount(amount, spent.decimals));
  const typed = { side, amount, balances, poolQuote };
  // Quoting needs no wallet and no clock; both are read when the trade is sent.
  const quoted = quoteTrade(market, typed);
  // A connected wallet waits for its balances, so a trade it can't afford is never sent.
  const holdingsRead = balances && allowances && (market.stage.kind !== 'pool' || permit2Allowances);
  const preview: TradeQuoteResult =
    quoted.ok && wallet && !holdingsRead
      ? { ok: false, block: { reason: 'reading-balances' }, quote: quoted.quote }
      : quoted;

  const fillMax =
    status.kind === 'idle' && spentBalance !== undefined && !isNativeAsset(spent)
      ? () => setAmount(formatUnits(spentBalance, spent.decimals))
      : undefined;

  function flip() {
    if (status.kind !== 'idle') return;
    setSide(side === 'buy' ? 'sell' : 'buy');
    setAmount('');
  }

  const submit = () =>
    singleFlight(async () => {
      if (!wallet || !holdingsRead) return;
      const plan = planTrade(market, { ...typed, wallet, allowances, permit2Allowances, now: unixNow() });
      if (!plan.ok) return;

      try {
        const receipt = await sendInOrder(sender, plan.transactions, {
          onStage: (stage, transaction) => setStatus({ kind: stage, step: tradeStep(transaction) }),
          revertMessage: (transaction) => revertMessage(transaction, side, spent.symbol),
        });
        setAmount('');
        toast.success({
          title: `${side === 'buy' ? 'Bought' : 'Sold'} ${market.token.symbol}`,
          action: { label: 'View transaction', href: externalLinks.explorerTx(receipt.transactionHash) },
        });
      } catch (error) {
        if (!isUserRejection(error)) {
          toast.error({
            title: side === 'buy' ? 'Buy failed' : 'Sell failed',
            description: describeTransactionError(error),
          });
        }
      } finally {
        setStatus(idle);
        // A buy that sold out the curve moves the page to Graduation pending.
        void invalidateChainReads(queryClient);
      }
    });

  return { side, flip, amount, setAmount, fillMax, preview, status, submit };
}
