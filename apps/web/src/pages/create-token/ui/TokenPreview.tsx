import { assetUrls } from '@/shared/config';
import { DetailList, DetailListItem } from '@/shared/ui/detail-list';
import { ImageIcon } from '@/shared/ui/icon';
import { TokenIcon } from '@/shared/ui/token-icon';
import { useLaunchDraft } from '../model/launch-draft';
import { useLaunchTerms } from '../model/launch-terms';

const PENDING = '…';

/** Live summary of the draft token and the terms it launches under. */
export function TokenPreview() {
  const { state } = useLaunchDraft();
  const { text } = useLaunchTerms(state.pairedAsset);

  return (
    <aside className="split-shell-preview launchpad-preview-panel">
      <div className="launchpad-token-preview">
        <div className="launchpad-preview-top">
          <div className="launchpad-preview-image">{state.logo ? <img src={state.logo} alt="" /> : <ImageIcon />}</div>
        </div>
        <div className="launchpad-preview-identity">
          <h2>{state.name || 'Your token'}</h2>
          <p>{state.ticker || 'ticker'}</p>
        </div>
        <DetailList className="launchpad-preview-details">
          <DetailListItem term="Launch fee">
            <span className="launchpad-preview-eth">
              {text?.launchFeeEth ?? PENDING}
              <TokenIcon src={assetUrls.native} size={14} />
            </span>
          </DetailListItem>
          <DetailListItem term="Paired with">{state.pairedAsset.symbol}</DetailListItem>
          <DetailListItem term="Trade fee">{text?.tradeFee ?? PENDING}</DetailListItem>
          <DetailListItem term="Launch window">
            {text ? `${text.snipeTax} snipe tax, ${text.snipeWindowSeconds}s` : PENDING}
          </DetailListItem>
          {Number(state.developerBuy) > 0 && (
            <DetailListItem term="Developer buy">
              {state.developerBuy.trim()} {state.pairedAsset.symbol}
            </DetailListItem>
          )}
          <DetailListItem term="Graduation">{text?.graduation ?? PENDING}</DetailListItem>
          <DetailListItem term="Buyback">{state.buyback ? 'On' : 'Off'}</DetailListItem>
          <DetailListItem term="Liquidity">Locked</DetailListItem>
        </DetailList>
      </div>
    </aside>
  );
}
