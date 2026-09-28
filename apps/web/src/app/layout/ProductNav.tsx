import { Link, NavLink, useLocation } from 'react-router';
import { useConnectedAddress } from '@/features/connect-wallet';
import { routes } from '@/shared/config';
import { useSlidingIndicator } from '@/shared/lib';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'nav-product-link is-active' : 'nav-product-link';

export function ProductNav() {
  const { pathname } = useLocation();
  const connected = useConnectedAddress();
  // Lit on the Connected wallet's own Profile only: another wallet's Profile is not "Profile".
  const onOwnProfile = connected !== undefined && pathname.toLowerCase() === routes.profileOf(connected).toLowerCase();
  // Connecting or switching wallets on a Profile changes which link is lit without a navigation.
  const { listRef, indicatorRef } = useSlidingIndicator<HTMLElement>(
    '.nav-product-link.is-active',
    `${pathname}|${onOwnProfile}`,
  );

  return (
    <nav ref={listRef} className="nav-product-links" aria-label="Product">
      <span ref={indicatorRef} className="nav-product-indicator" aria-hidden="true" />
      <NavLink className={navLinkClass} to={routes.launchpad}>
        Explore
      </NavLink>
      <NavLink className={navLinkClass} to={routes.analytics}>
        Analytics
      </NavLink>
      <Link
        className={navLinkClass({ isActive: onOwnProfile })}
        to={routes.profile}
        aria-current={onOwnProfile ? 'page' : undefined}
      >
        Profile
      </Link>
    </nav>
  );
}
