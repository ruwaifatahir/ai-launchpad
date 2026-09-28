import { useId, type CSSProperties } from 'react';
import { formatUnits } from 'viem';
import { formatBalance, useConnectedAddress, WalletGate } from '@/features/connect-wallet';
import { pairedAssetIcon } from '@/shared/config';
import { cx, formatTradeAmount } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { SwapIcon } from '@/shared/ui/icon';
import { RollingNumber } from '@/shared/ui/rolling-number';
import { TokenIcon } from '@/shared/ui/token-icon';
import type { CurveState } from '../api/curve-state';
import type { LaunchRecord } from '@/entities/token';
import { useTradeReads } from '../api/trade-reads';
import { dollarLine } from '../model/dollar-line';
import type { TokenIdentity } from '../model/token-identity';
import { useTrade } from '../model/trade';
import { chargedSnipeTaxBps, type TradeMarket } from '../model/trade-plan';
import { poolKey } from '../model/uniswap-pool';
import { amountEms } from './amount-width';
import { AmountField } from './AmountField';
import { ConvertPanel } from './ConvertPanel';
import { TokenHeader } from './TokenHeader';
import { isLoadingBlock, tradeButtonHint, tradeButtonLabel } from './trade-button';

type TradeCardProps = {
  identity: TokenIdentity;
  launch: LaunchRecord;
  stage: TradeMarket['stage'];
  curveState: CurveState | null;
  /** The market's price in the Paired asset per token, or `null` while unread. */
  price: number | null;
  /** The Paired asset's Dollar rate, or `null` to show no dollar line. */
  rate: number | null;
};

export function TradeCard({ identity, launch, stage, curveState, price, rate }: TradeCardProps) {
  const inputId = useId();
  const wallet = useConnectedAddress();
  const { pair, symbol } = identity;
  const reads = useTradeReads(launch, pair, stage.kind, curveState, wallet);
  const token = { address: identity.address, symbol, decimals: identity.decimals };
  const pool = stage.kind === 'pool' ? poolKey(launch) : null;
  const market: TradeMarket = { stage, token, pair, curve: reads.curve, pool };
  const trade = useTrade(market, reads);
  const busy = trade.status.kind !== 'idle';
  const selling = trade.side === 'sell';

  const assets = {
    paired: { ...pair, icon: <TokenIcon src={pairedAssetIcon(pair)} size={20} /> },
    token: { ...token, icon: identity.logo ? <TokenIcon src={identity.logo} size={20} /> : null },
  };
  const [spent, received] = selling ? (['token', 'paired'] as const) : (['paired', 'token'] as const);
  const balanceOf = (key: keyof typeof assets) => {
    if (!wallet) return 'Connect to see balance';
    const balance = reads.balances?.[key];
    if (balance === undefined) return undefined;
    const asset = assets[key];
    return `${formatBalance(formatUnits(balance, asset.decimals), asset.symbol)} available`;
  };
  const currency = (key: keyof typeof assets) => (
    <span className="convert-currency">
      {assets[key].icon}
      {assets[key].symbol}
    </span>
  );

  const { preview } = trade;
  const quote = preview.quote;
  const amountReceived = quote ? Number(formatUnits(quote.amountOut, assets[received].decimals)) : 0;
  const amountOut = formatTradeAmount(amountReceived);
  // Each side's dollar line: the Paired asset at its rate, the token through its chain price.
  const pairPerUnit = { paired: 1, token: price };
  const spentDollars = dollarLine(Number(trade.amount), { pairPerUnit: pairPerUnit[spent], rate });
  const receivedDollars = dollarLine(amountReceived, { pairPerUnit: pairPerUnit[received], rate });
  const hint = tradeButtonHint(trade);
  const loading = !preview.ok && isLoadingBlock(preview.block);
  const snipeTaxBps = !selling && reads.curve ? chargedSnipeTaxBps(reads.curve) : 0;

  return (
    <article className="convert-card token-buy-card">
      <TokenHeader identity={identity} />
      <div className="token-buy-trade-panel">
        <div className="convert-stack">
          <ConvertPanel
            label="Sell"
            amount={
              <>
                <AmountField
                  id={inputId}
                  value={trade.amount}
                  onChange={trade.setAmount}
                  readOnly={busy}
                  label={`Amount of ${assets[spent].symbol} to ${selling ? 'sell' : 'spend'}`}
                />
                {spentDollars !== null && (
                  <RollingNumber value={spentDollars} label={`Worth ${spentDollars}`} className="convert-fiat" />
                )}
              </>
            }
            asset={currency(spent)}
            balance={balanceOf(spent)}
            // No max fill for ETH: spending the whole balance would leave nothing for gas.
            onFill={trade.fillMax}
          />
          <div className="convert-swap-wrap">
            <button
              type="button"
              className="convert-swap"
              aria-label="Switch between buying and selling"
              onClick={trade.flip}
              disabled={busy}
            >
              <SwapIcon />
            </button>
          </div>
          <ConvertPanel
            label="Buy"
            amount={
              <>
                <div className="convert-amount-field" style={{ '--amount-ems': amountEms(amountOut) } as CSSProperties}>
                  <RollingNumber
                    value={amountOut}
                    label={`Amount of ${assets[received].symbol} received`}
                    className="convert-amount-digits"
                  />
                </div>
                {receivedDollars !== null && (
                  <RollingNumber value={receivedDollars} label={`Worth ${receivedDollars}`} className="convert-fiat" />
                )}
              </>
            }
            asset={currency(received)}
            balance={balanceOf(received)}
          />
        </div>
        {snipeTaxBps > 0 && (
          <div className="convert-footer">
            <span className="convert-footer-rate">Snipe tax: {snipeTaxBps / 100}%</span>
          </div>
        )}
        <WalletGate>
          <Button
            className={cx(!preview.ok && !loading && 'is-blocked')}
            disabled={!preview.ok}
            busy={busy || loading}
            onClick={() => void trade.submit()}
          >
            {tradeButtonLabel(trade, symbol, assets[spent].symbol)}
          </Button>
        </WalletGate>
        {hint && (
          <p className="convert-hint token-trade-hint" role="status">
            {hint}
          </p>
        )}
      </div>
    </article>
  );
}
