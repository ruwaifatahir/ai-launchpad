import type { Trade } from '../model/trade';
import type { TradeBlock } from '../model/trade-plan';

/** Waits on a read, not on the user: the button shows it as busy rather than blocked. */
const LOADING: ReadonlySet<TradeBlock['reason']> = new Set([
  'reading-curve',
  'reading-pool',
  'reading-balances',
  'quoting',
]);

export const isLoadingBlock = (block: TradeBlock) => LOADING.has(block.reason);

/** Why the trade can't be made, short enough for the button. */
export function blockLabel(block: TradeBlock): string {
  switch (block.reason) {
    case 'graduation-pending':
      return 'Trading closed until Graduation';
    case 'rescued':
      return 'No longer trades';
    case 'reading-curve':
      return 'Reading the curve…';
    case 'reading-pool':
      return 'Reading the Pool…';
    case 'reading-balances':
      return 'Reading your balances…';
    case 'no-amount':
      return 'Enter an amount';
    case 'quoting':
      return 'Quoting…';
    case 'no-quote':
      return 'No quote for this amount';
    case 'quote-unavailable':
      return 'Quote unavailable, retrying';
    case 'too-small':
      return 'Amount too small';
    case 'insufficient-balance':
      return `Not enough ${block.symbol}`;
  }
}

/** Short enough for one line; what the wallet is asking for goes in `tradeButtonHint`. */
export function tradeButtonLabel(
  trade: Pick<Trade, 'side' | 'status' | 'preview'>,
  symbol: string,
  spentSymbol: string,
) {
  const { status } = trade;
  const selling = trade.side === 'sell';
  if (status.kind === 'signing') {
    if (status.step === 'approve') return `Approve ${spentSymbol}`;
    if (status.step === 'permit2') return 'Approve Permit2';
    return `Confirm ${selling ? 'sell' : 'buy'}`;
  }
  if (status.kind === 'confirming') {
    if (status.step === 'approve') return `Approving ${spentSymbol}…`;
    if (status.step === 'permit2') return 'Approving Permit2…';
    return selling ? 'Selling…' : 'Buying…';
  }
  return trade.preview.ok ? `${selling ? 'Sell' : 'Buy'} ${symbol}` : blockLabel(trade.preview.block);
}

/** The line under the button while the wallet waits on the user. */
export function tradeButtonHint(trade: Pick<Trade, 'status'>): string | null {
  return trade.status.kind === 'signing' ? 'Confirm in your wallet' : null;
}
