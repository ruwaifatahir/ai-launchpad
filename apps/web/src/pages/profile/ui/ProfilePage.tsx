import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getAddress, isAddress } from 'viem';
import { useConnectedAddress } from '@/features/connect-wallet';
import { TokenGrid } from '@/entities/token';
import { externalLinks, routes } from '@/shared/config';
import { shortenAddress } from '@/shared/lib';
import { CopyAddressButton } from '@/shared/ui/copy-address';
import { GlobeIcon } from '@/shared/ui/icon';
import { Pagination, pageToMoveTo } from '@/shared/ui/pagination';
import { PROFILE_EAGER_CARDS } from '../config/profile-list';
import { useCreatorTokensList } from '../model/creator-tokens';
import { ProfileShell, ProfileStatus } from './ProfileShell';

/** `/profile/:address`: any wallet's Profile, in any letter case. */
export function ProfilePage() {
  const { address = '' } = useParams();

  if (!isAddress(address, { strict: false })) {
    return (
      <ProfileShell>
        <ProfileStatus title="Not a wallet address">
          <p>This link doesn’t point at a wallet. A wallet address starts with 0x and has 40 more characters.</p>
          <Link to={routes.launchpad}>Explore launched tokens</Link>
        </ProfileStatus>
      </ProfileShell>
    );
  }
  // Keyed so another wallet starts from its own first page.
  return <WalletProfile key={address.toLowerCase()} address={getAddress(address)} />;
}

function WalletProfile({ address }: { address: string }) {
  const titleId = useId();
  const connected = useConnectedAddress();
  const own = connected !== undefined && connected.toLowerCase() === address.toLowerCase();
  const [page, setPage] = useState(1);
  const list = useCreatorTokensList(address, page, own);
  // Adjusting state while rendering, as React documents, so a page the list shrank past is left at once.
  const moveTo = pageToMoveTo(page, list.pageCount);
  if (moveTo !== null) setPage(moveTo);

  return (
    <ProfileShell>
      <title>{own ? 'Your profile · AI Launchpad' : `${shortenAddress(address)} · AI Launchpad`}</title>
      <header className="profile-head">
        <div className="profile-identity">
          <h1 className="profile-address" translate="no">
            {address}
          </h1>
          {/* While the list is unavailable the grid says so; the count keeps its line, empty. */}
          <p className="profile-count" aria-live="polite" aria-busy={list.grid.status === 'loading' || undefined}>
            {list.count ?? (list.grid.status === 'loading' ? 'Counting launches…' : ' ')}
          </p>
        </div>
        <div className="profile-links">
          <CopyAddressButton address={address} label="Wallet address" className="profile-link" text="Copy address" />
          <a
            className="profile-link"
            href={externalLinks.explorerAddress(address)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <GlobeIcon />
            <span>Explorer</span>
          </a>
        </div>
      </header>

      <section className="launch-explore float" aria-labelledby={titleId}>
        <header className="launch-explore-section-head">
          <div className="launch-explore-head-main">
            <div className="launch-explore-title-row">
              <h2 id={titleId}>{own ? 'Your tokens' : 'Tokens launched'}</h2>
            </div>
            <p className="launch-explore-copy">
              {own ? 'Every token you launched, newest first.' : 'Every token this wallet launched, newest first.'}
            </p>
          </div>
        </header>
        <TokenGrid
          grid={list.grid}
          eagerCount={PROFILE_EAGER_CARDS}
          emptyAction={
            own && (
              <Link className="profile-create-link" to={routes.createToken}>
                Create a token
              </Link>
            )
          }
        />
        {list.grid.status === 'ready' && list.pageCount !== null && (
          <Pagination
            className="launch-explore-pagination"
            label="Launched token pages"
            pageCount={list.pageCount}
            page={page}
            onPageChange={setPage}
          />
        )}
      </section>
    </ProfileShell>
  );
}
