import { Link } from 'react-router';
import { routes } from '@/shared/config';
import { shortenAddress } from '@/shared/lib';

/**
 * A wallet's short address, linking to its Profile. A `contract` (the Bonding curve, the Pool, a
 * Buyback) has no Profile, so its address stays plain text.
 */
export function WalletLink({ wallet, contract, className }: { wallet: string; contract: boolean; className: string }) {
  if (contract) {
    return (
      <span className={className} title={wallet}>
        {shortenAddress(wallet)}
      </span>
    );
  }
  return (
    <Link className={className} to={routes.profileOf(wallet)} title={wallet}>
      {shortenAddress(wallet)}
    </Link>
  );
}
