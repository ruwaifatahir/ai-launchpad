import { externalLinks, pairedAssetIcon } from '@/shared/config';
import type { TokenIdentity } from '../model/token-identity';
import type { TradeRowView } from '../model/recent-trades';
import { WalletLink } from './WalletLink';

type TradeSide = TradeRowView['side'];

// Arrow pointing up-right for buys, down-left for sells.
const DIRECTION_PATH: Record<TradeSide, string> = {
  buy: 'M7 17 L17 7 M10 7 H17 V14',
  sell: 'M17 7 L7 17 M14 17 H7 V10',
};

/** The side in words, so a sell never reads only as a dimmer arrow. */
const SIDE_VERB: Record<TradeSide, string> = { buy: 'Bought', sell: 'Sold' };

type TradeRowProps = {
  trade: TradeRowView;
  symbol: string;
  pair: TokenIdentity['pair'];
};

export function TradeRow({ trade, symbol, pair }: TradeRowProps) {
  const pairSymbol = pair.symbol;
  const verb = SIDE_VERB[trade.side];
  return (
    <li>
      <div className={`token-trades-row is-${trade.side}`}>
        <span className="token-trades-dir" aria-hidden="true">
          <svg className="token-trades-dir-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d={DIRECTION_PATH[trade.side]}
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="token-trades-main">
          <a
            className="token-trades-amount"
            href={externalLinks.explorerTx(trade.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${trade.label ? `${trade.label}: ` : ''}${verb} ${trade.amount} ${symbol} for ${trade.pairAmount} ${pairSymbol}, view transaction`}
          >
            <span className="token-trades-side">{verb}</span> {trade.amount}
            <span className="token-trades-symbol"> {symbol}</span>
          </a>
          <span className="token-trades-by">
            {trade.label && <span className="token-trades-kind">{trade.label}</span>}
            {/* A labelled trade was made by one of our contracts. */}
            <WalletLink wallet={trade.wallet} contract={trade.label !== null} className="token-trades-wallet" />
          </span>
        </div>
        <span className="token-trades-quote">
          <span className="token-trades-value">
            <span className="token-trades-eth">
              {trade.pairAmount}
              <span className="quote-asset-chip">
                <img alt={pairSymbol} width="20" height="20" src={pairedAssetIcon(pair)} />
              </span>
            </span>
            <small>{trade.venue}</small>
          </span>
        </span>
        <time className="token-trades-time" dateTime={trade.datetime} title={trade.fullTime}>
          {trade.age}
        </time>
      </div>
    </li>
  );
}
