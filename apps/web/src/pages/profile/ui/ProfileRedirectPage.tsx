import { Navigate } from 'react-router';
import { ConnectWalletButton, useWalletStatus } from '@/features/connect-wallet';
import { routes } from '@/shared/config';
import { ProfileShell, ProfileStatus } from './ProfileShell';

/** `/profile`: the Connected wallet's own Profile, on any network, or a prompt to connect one. */
export function ProfileRedirectPage() {
  const wallet = useWalletStatus();

  if (wallet.kind === 'ready' || wallet.kind === 'wrong-network') {
    return <Navigate to={routes.profileOf(wallet.address)} replace />;
  }
  // A wallet reconnecting on load is about to redirect: asking it to connect would only flash.
  if (wallet.kind === 'connecting') {
    return (
      <ProfileShell>
        <p className="profile-count" role="status">
          Checking your wallet…
        </p>
      </ProfileShell>
    );
  }
  return (
    <ProfileShell>
      <ProfileStatus title="Your profile">
        <p>Connect a wallet to see the tokens you launched.</p>
        <div className="profile-status-action">
          <ConnectWalletButton />
        </div>
      </ProfileStatus>
    </ProfileShell>
  );
}
