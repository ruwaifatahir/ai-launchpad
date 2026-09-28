import type { TokenIdentity } from '../model/token-identity';
import { TokenHeader } from './TokenHeader';

/** Stands in for the trade card on a Rescued token, which can no longer be traded anywhere. */
export function RescuedCard({ identity }: { identity: TokenIdentity }) {
  return (
    <article className="convert-card token-buy-card">
      <TokenHeader identity={identity} />
      <p className="token-trade-notice" role="note">
        This launch was rescued and no longer trades.
      </p>
    </article>
  );
}
