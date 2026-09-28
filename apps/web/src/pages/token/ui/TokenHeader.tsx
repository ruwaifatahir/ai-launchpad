import type { TokenIdentity } from '../model/token-identity';
import { PairBadge } from './PairBadge';

/** Logo, name, symbol and Paired asset, at the top of the trade card. */
export function TokenHeader({ identity }: { identity: TokenIdentity }) {
  return (
    <header className="token-buy-header">
      {identity.logo ? (
        <img className="token-buy-logo" src={identity.logo} alt="" />
      ) : (
        // No logo set at Launch: the symbol's first letter stands in.
        <span className="token-buy-logo" aria-hidden="true">
          {[...identity.symbol][0] ?? ''}
        </span>
      )}
      <div className="v2-token-identity">
        <h1>{identity.name}</h1>
        <p>
          <span>{identity.symbol}</span>
          <PairBadge pair={identity.pair} />
        </p>
      </div>
    </header>
  );
}
