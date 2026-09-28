import type { CSSProperties } from 'react';
import type { HolderRowView } from '../model/holders';
import { WalletLink } from './WalletLink';

export function HolderRow({ holder }: { holder: HolderRowView }) {
  return (
    <div className="token-holder-row v2-token-holder-row" role="row">
      <span className="token-holder-rank" role="cell">
        {holder.rank}
      </span>
      <span className="token-holder-identity" role="cell">
        {holder.label && <span className="token-holder-kind">{holder.label}</span>}
        {/* A labelled holder is one of our contracts, such as the Bonding curve or the Pool. */}
        <WalletLink wallet={holder.wallet} contract={holder.label !== null} className="token-holder-wallet" />
      </span>
      <span className="token-holder-supply token-holder-share" role="cell">
        {holder.share}
        <span
          className="token-holder-share-bar"
          style={{ '--share': `${holder.sharePercent}%` } as CSSProperties}
          aria-hidden="true"
        />
      </span>
      <span className="token-holder-supply" role="cell">
        {holder.balance}
      </span>
    </div>
  );
}
