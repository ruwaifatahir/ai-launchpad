import { formatUnits, isAddressEqual } from 'viem';
import { useConnectedAddress, WalletGate } from '@/features/connect-wallet';
import { formatPairAmount, shortenAddress } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { useClaimableCreatorFees } from '../api/creator-fees';
import { useClaimCreatorFees, type ClaimStatus } from '../model/creator-fees';
import type { TokenIdentity } from '../model/token-identity';

const claimLabels: Record<ClaimStatus, string> = {
  idle: 'Claim',
  signing: 'Confirm in your wallet',
  confirming: 'Claiming…',
};

/**
 * What the token's Creator wallet can claim from the fee escrow, across every launch paid to it.
 * The Creator wallet gets a Claim button; anyone else is told which wallet can claim.
 */
export function CreatorFeesCard({ identity }: { identity: TokenIdentity }) {
  const { pair } = identity;
  const claimable = useClaimableCreatorFees(identity);
  const wallet = useConnectedAddress();
  const isCreator = wallet !== undefined && isAddressEqual(wallet, identity.creatorWallet);
  const creatorWallet = shortenAddress(identity.creatorWallet);
  const amount = claimable === undefined ? '…' : formatPairAmount(Number(formatUnits(claimable, pair.decimals)));

  return (
    <section className="token-creator-fees-card">
      <header className="token-creator-fees-header">
        <h2>Creator fees</h2>
      </header>
      <div className="token-creator-fees-assets">
        <div>
          <strong className="token-creator-fees-amount" aria-busy={claimable === undefined || undefined}>
            {amount} {pair.symbol}
          </strong>
          <small className="token-creator-fees-note">Claimable now, across every launch paid to {creatorWallet}</small>
        </div>
      </div>
      {isCreator ? (
        <ClaimAction identity={identity} claimable={claimable} />
      ) : (
        <p className="token-creator-fees-hint" role="note">
          Payable to {creatorWallet}. Connect that wallet to claim.
        </p>
      )}
    </section>
  );
}

function ClaimAction({ identity, claimable }: { identity: TokenIdentity; claimable: bigint | undefined }) {
  const claim = useClaimCreatorFees(identity.pair);
  const busy = claim.status !== 'idle';
  // The escrow reverts a claim of nothing.
  const empty = claimable === undefined || claimable === 0n;
  return (
    <div className="token-creator-fees-state">
      <span>Payable to your wallet.</span>
      <div className="token-creator-fees-action">
        <WalletGate>
          <Button disabled={empty} busy={busy} onClick={() => void claim.submit()}>
            {busy ? claimLabels[claim.status] : empty ? 'Nothing to claim' : claimLabels.idle}
          </Button>
        </WalletGate>
      </div>
    </div>
  );
}
