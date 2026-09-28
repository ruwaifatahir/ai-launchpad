import { describe, expect, it } from 'vitest';
import type { Trade } from '../model/trade';
import type { TradeQuote } from '../model/trade-plan';
import type { PoolKey } from '../model/uniswap-pool';
import { isLoadingBlock, tradeButtonHint, tradeButtonLabel } from './trade-button';

const quote = {} as TradeQuote;
const ready: Trade['preview'] = { ok: true, quote, sent: 1n, venue: { kind: 'pool', key: {} as PoolKey } };
const trade = (overrides: Partial<Pick<Trade, 'side' | 'status' | 'preview'>> = {}) => ({
  side: 'buy' as const,
  status: { kind: 'idle' as const },
  preview: ready,
  ...overrides,
});

/** The label while the wallet is at `step` of a buy spending NVDA. */
const at = (kind: 'signing' | 'confirming', step: 'approve' | 'permit2' | 'trade') =>
  tradeButtonLabel(trade({ status: { kind, step } }), 'YOYO', 'NVDA');

describe('tradeButtonLabel', () => {
  it('names the trade when it can be sent', () => {
    expect(tradeButtonLabel(trade(), 'YOYO', 'ETH')).toBe('Buy YOYO');
    expect(tradeButtonLabel(trade({ side: 'sell' }), 'YOYO', 'YOYO')).toBe('Sell YOYO');
  });

  it('follows each wallet request through signing and confirming', () => {
    expect([at('signing', 'approve'), at('confirming', 'approve')]).toEqual(['Approve NVDA', 'Approving NVDA…']);
    expect([at('signing', 'permit2'), at('confirming', 'permit2')]).toEqual(['Approve Permit2', 'Approving Permit2…']);
    expect([at('signing', 'trade'), at('confirming', 'trade')]).toEqual(['Confirm buy', 'Buying…']);
  });

  it('says why the trade is blocked', () => {
    const blocked = trade({ preview: { ok: false, block: { reason: 'insufficient-balance', symbol: 'ETH' }, quote } });

    expect(tradeButtonLabel(blocked, 'YOYO', 'ETH')).toBe('Not enough ETH');
  });
});

describe('isLoadingBlock', () => {
  it('tells waiting on a read from a problem the user has to fix', () => {
    expect(isLoadingBlock({ reason: 'quoting' })).toBe(true);
    expect(isLoadingBlock({ reason: 'reading-balances' })).toBe(true);
    expect(isLoadingBlock({ reason: 'no-amount' })).toBe(false);
    expect(isLoadingBlock({ reason: 'too-small' })).toBe(false);
  });
});

describe('tradeButtonHint', () => {
  it('asks for the wallet only while it waits on the user', () => {
    expect(tradeButtonHint({ status: { kind: 'signing', step: 'trade' } })).toBe('Confirm in your wallet');
    expect(tradeButtonHint({ status: { kind: 'confirming', step: 'trade' } })).toBeNull();
  });
});
