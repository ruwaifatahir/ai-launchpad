import { Link } from 'react-router';
import { externalLinks, routes } from '@/shared/config';
import { shortenAddress } from '@/shared/lib';
import { CopyAddressButton } from '@/shared/ui/copy-address';
import { GlobeIcon } from '@/shared/ui/icon';
import type { TokenIdentity } from '../model/token-identity';
import { PairBadge } from './PairBadge';

export function TokenAboutCard({ identity }: { identity: TokenIdentity }) {
  return (
    <section className="token-about-card">
      <div className="token-about-head">
        <h2>About</h2>
        <PairBadge pair={identity.pair} />
      </div>
      <div className="v2-about-body">
        {identity.description && <p>{identity.description}</p>}
        <p className="v2-about-terms">
          <span className="v2-about-creator">
            Creator{' '}
            <Link to={routes.profileOf(identity.creator)} title={identity.creator}>
              {shortenAddress(identity.creator)}
            </Link>
          </span>
          <span aria-hidden="true">·</span>
          {identity.creatorTax} creator tax
        </p>
      </div>
      <div className="token-about-burn">
        <span className="token-about-burn-label">Supply</span>
        <div className="token-about-burn-value">
          <span>{identity.supply}</span>
          <span>{identity.symbol}</span>
        </div>
        <small className="token-about-burn-meta">Fixed at launch</small>
      </div>
      <div className="token-info-links">
        <CopyAddressButton address={identity.address} label="Contract address" className="token-copy-address" />
        <a href={externalLinks.explorerToken(identity.address)} target="_blank" rel="noopener noreferrer">
          <GlobeIcon />
          <span>Explorer</span>
        </a>
        {identity.socials.map((social) => (
          <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer">
            <span>{social.label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
