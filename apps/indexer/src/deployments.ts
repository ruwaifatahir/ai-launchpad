import { getAddress, isAddress, type Address } from "viem";

// Every address the indexer knows, read from the environment once at startup, so that
// pointing it at another deployment or another chain is a change of env and no code.
// A missing or malformed value stops the process with the variable's name.

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

function address(name: string): Address {
  const value = required(name);
  if (!isAddress(value, { strict: false })) {
    throw new Error(`${name} must be a 0x-prefixed 20-byte address, got "${value}"`);
  }
  return getAddress(value);
}

function wholeNumber(name: string): number {
  const value = required(name);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be a whole number, got "${value}"`);
  }
  return Number(value);
}

export const deployment = {
  chainId: wholeNumber("CHAIN_ID"),
  // The block the launchpad was deployed in, or any block before it. Every source starts
  // here: nothing it listens to can have logged earlier.
  startBlock: wholeNumber("START_BLOCK"),
  // Ponder sources: the indexer listens to their events.
  factory: address("FACTORY_ADDRESS"),
  hook: address("HOOK_ADDRESS"),
  // Not Ponder sources: their addresses only tag protocol holders and pick logs out of a
  // receipt.
  locker: address("LOCKER_ADDRESS"),
  buybackVault: address("BUYBACK_VAULT_ADDRESS"),
  // Uniswap v4's PoolManager. It holds every pool's tokens and logs every Swap on the
  // chain, not only ours, so it is not a source: pool trades are found through the
  // hook's events and read from that transaction's receipt.
  poolManager: address("POOL_MANAGER_ADDRESS"),
};
