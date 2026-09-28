import { Link } from 'react-router';
import { HeaderWalletButton } from '@/features/connect-wallet';
import { assetUrls, routes } from '@/shared/config';
import { ProductNav } from './ProductNav';

export function SiteHeader() {
  return (
    <div className="top-chrome">
      <header className="nav">
        <div className="nav-bar">
          <div className="nav-inner">
            <div className="nav-left">
              <Link className="nav-brand" aria-label="AI Launchpad home" to={routes.launchpad}>
                <img
                  alt="AI Launchpad"
                  width="48"
                  height="48"
                  decoding="async"
                  className="nav-logo"
                  src={assetUrls.logo}
                />
              </Link>
              <ProductNav />
            </div>
            <div className="nav-right">
              <HeaderWalletButton />
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}
