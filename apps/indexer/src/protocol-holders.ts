import { isAddressEqual, type Address } from "viem";

import { deployment } from "./deployments";

// Where wallets send tokens they want out of circulation. The token's own burn() goes to
// the zero address instead, which is never a holder.
export const burnAddress = "0x000000000000000000000000000000000000dEaD";

// Holders of every launch token that are listed with a tag, not counted. The hook holds
// a pool trade's fee, when taken in the launch token, until the fee is swept.
const sharedProtocolHolders: Address[] = [
  deployment.poolManager,
  deployment.hook,
  deployment.locker,
  deployment.buybackVault,
  burnAddress,
];

// Whether a wallet holds a launch token as part of the launchpad's workings. The launch's
// own curve is one too; it is undefined before the launch row exists.
export function isProtocolHolder(wallet: Address, curve: Address | undefined): boolean {
  const protocolHolders = curve
    ? [...sharedProtocolHolders, curve]
    : sharedProtocolHolders;
  return protocolHolders.some((address) => isAddressEqual(address, wallet));
}
