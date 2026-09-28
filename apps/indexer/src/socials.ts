import type { ContractFunctionReturnType } from "viem";

import type { PonsV2LauncherTokenAbi } from "../abis/PonsV2LauncherTokenAbi";

// A launch's socials, as the launch token's socials() returns them. The creator may leave
// any of them empty; that is stored as null, so "not set" has one form.
export function socialsFrom([
  twitter,
  telegram,
  discord,
  website,
  farcaster,
]: ContractFunctionReturnType<typeof PonsV2LauncherTokenAbi, "view", "socials">) {
  const nullIfUnset = (value: string) => (value === "" ? null : value);
  return {
    twitter: nullIfUnset(twitter),
    telegram: nullIfUnset(telegram),
    discord: nullIfUnset(discord),
    website: nullIfUnset(website),
    farcaster: nullIfUnset(farcaster),
  };
}
