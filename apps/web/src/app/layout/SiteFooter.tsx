import { Link } from 'react-router';
import { externalLinks, routes, supportedNetwork } from '@/shared/config';

/** `to` is a page of ours; `href` leaves the app in a new tab. */
type FooterLink = { label: string } & ({ to: string } | { href: string });

const PRODUCT_LINKS: FooterLink[] = [
  { label: 'Explore', to: routes.launchpad },
  { label: 'Analytics', to: routes.analytics },
  { label: 'Create', to: routes.createToken },
  { label: 'Profile', to: routes.profile },
];

const PROJECT_LINKS: FooterLink[] = [{ label: 'GitHub', href: externalLinks.sourceCode }];

function FooterLinkColumn({ heading, links }: { heading: string; links: FooterLink[] }) {
  return (
    <nav className="footer-link-col" aria-label={heading}>
      <p className="footer-link-heading">{heading}</p>
      <ul className="footer-link-list">
        {links.map((link) => (
          <li key={link.label}>
            {'to' in link ? (
              <Link className="footer-link" to={link.to}>
                {link.label}
              </Link>
            ) : (
              <a className="footer-link" href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer-reveal" aria-label="Site footer">
      <div className="footer-stage">
        <div className="footer-card">
          <div className="footer-card-inner">
            <div className="footer-grid">
              <div className="footer-brand-col">
                <Link to={routes.launchpad} className="footer-logo-link" aria-label="AI Launchpad home">
                  <span className="footer-brand-name">AI Launchpad</span>
                </Link>
                <p className="footer-brand-copy">
                  Launch and explore fixed-supply tokens on {supportedNetwork.name}. Your wallet submits every
                  transaction. AI Launchpad does not custody assets.
                </p>
              </div>
              <FooterLinkColumn heading="Product" links={PRODUCT_LINKS} />
              <FooterLinkColumn heading="Project" links={PROJECT_LINKS} />
            </div>
            <div className="footer-card-bottom">
              <p className="footer-fineprint">
                Transactions are submitted through your wallet and may be irreversible. Tokens can be volatile or lose
                all value. AI Launchpad does not provide custody, warranties, or financial advice.
              </p>
              <p className="footer-copy">
                AI Launchpad — open source on{' '}
                <a className="footer-link" href={externalLinks.sourceCode} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
