import { getCreate2Address, keccak256, toBeHex, type BytesLike } from "ethers";
import { EXTERNAL, HOOK_FLAG_MASK, REQUIRED_HOOK_BITS } from "../config/pons.js";

export interface MinedSalt {
  salt: string;
  address: string;
  attempts: number;
}

/**
 * Uniswap V4 reads a hook's permissions from the low 14 bits of its address, so
 * PonsV2MemeHook can only be deployed to an address ending in the exact flag
 * pattern it declares. Brute-force a CREATE2 salt until the resulting address
 * matches. ~1 in 16,384 salts hit, so this is a fraction of a second.
 */
export function mineHookSalt(
  initCode: BytesLike,
  deployer: string = EXTERNAL.create2Deployer,
  startAt = 0n,
  maxAttempts = 5_000_000n,
): MinedSalt {
  const initCodeHash = keccak256(initCode);
  for (let i = 0n; i < maxAttempts; i++) {
    const salt = toBeHex(startAt + i, 32);
    const address = getCreate2Address(deployer, salt, initCodeHash);
    if ((Number(BigInt(address) & BigInt(HOOK_FLAG_MASK))) === REQUIRED_HOOK_BITS) {
      return { salt, address, attempts: Number(i) + 1 };
    }
  }
  throw new Error(`No hook salt found in ${maxAttempts} attempts`);
}

/** True if `address` encodes exactly the permissions PonsV2MemeHook declares. */
export function hasValidHookFlags(address: string): boolean {
  return Number(BigInt(address) & BigInt(HOOK_FLAG_MASK)) === REQUIRED_HOOK_BITS;
}

/** Calldata for Arachnid's deterministic deployer: salt ++ initCode. */
export function create2Calldata(salt: string, initCode: string): string {
  return salt + initCode.slice(2);
}
