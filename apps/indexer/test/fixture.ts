import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Address, Hash, Hex } from "viem";

import type { RawLog, TransactionContext } from "../src/trades";

// A Pons mainnet transaction, as written by scripts/record-fixture.ts.
export type Fixture = {
  chainId: number;
  launch: {
    token: Address;
    curve: Address;
    creator: Address;
    quoteAsset: Address;
    // Set for a pool trade: the launch's Uniswap pool.
    poolId?: Hex;
  };
  // Set for a pool trade: where its logs come from.
  hook?: Address;
  poolManager?: Address;
  transaction: { hash: Hash; from: Address; blockNumber: string; blockTimestamp: string };
  logs: RawLog[];
  pons: {
    id: string;
    venue: string;
    side: string;
    tokenAmount: string;
    quoteAmount: string;
    account: string;
    transactionHash: string;
    blockNumber: number;
    timestamp: number;
  }[];
};

const fixturesDir = join(import.meta.dirname, "fixtures");

export function load(name: string): Fixture {
  return JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), "utf8")) as Fixture;
}

export function fixtureNames(): string[] {
  return readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length));
}

export function transactionOf(fixture: Fixture): TransactionContext {
  return {
    hash: fixture.transaction.hash,
    signer: fixture.transaction.from,
    blockNumber: BigInt(fixture.transaction.blockNumber),
    timestamp: BigInt(fixture.transaction.blockTimestamp),
  };
}

export function price(quoteAmount: bigint, launchTokenAmount: bigint): number {
  return Number(quoteAmount) / Number(launchTokenAmount);
}

export const lower = (value: string) => value.toLowerCase();
