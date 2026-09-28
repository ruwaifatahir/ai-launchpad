// Dev tool, not part of the indexer: records test fixtures from Pons's live deployment.
//
// Records one Pons mainnet bonding curve's whole history as a test fixture: every log it
// emitted up to a block, and its reserves read at that block as the expected values.
//
//   node scripts/record-curve-history.ts <name> <launch token>
//
// Writes test/fixtures/curve-history/<name>.json. The reserves are read at the last block
// of the history, which must be recent: the public RPC keeps only a few minutes of state.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, getAddress, http, isAddress, parseAbi } from "viem";

// Robinhood Chain mainnet unless overridden.
const rpcUrl = process.env.FIXTURE_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";

const tokenAbi = parseAbi(["function curve() view returns (address)"]);
const curveAbi = parseAbi([
  "function phantomQuote() view returns (uint256)",
  "function launchSupply() view returns (uint256)",
  "function realQuoteReserve() view returns (uint256)",
  "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
]);

const [name, tokenArg] = process.argv.slice(2);
if (!name || !/^[a-z0-9-]+$/.test(name) || !tokenArg || !isAddress(tokenArg)) {
  console.error("Usage: node scripts/record-curve-history.ts <name> <launch token>");
  process.exit(1);
}
const token = getAddress(tokenArg);

const client = createPublicClient({ transport: http(rpcUrl) });
const curve = await client.readContract({
  abi: tokenAbi,
  address: token,
  functionName: "curve",
});
const blockNumber = await client.getBlockNumber();
const read = <F extends "phantomQuote" | "launchSupply" | "realQuoteReserve">(
  functionName: F,
) => client.readContract({ abi: curveAbi, address: curve, functionName, blockNumber });

const [phantomQuote, launchSupply, realQuoteReserve, [, tokenReserve]] =
  await Promise.all([
    read("phantomQuote"),
    read("launchSupply"),
    read("realQuoteReserve"),
    client.readContract({
      abi: curveAbi,
      address: curve,
      functionName: "getReserves",
      blockNumber,
    }),
  ]);

// The curve's first log is its Initialized, in the launch transaction.
const logs = await client.getLogs({
  address: curve,
  fromBlock: 0n,
  toBlock: blockNumber,
});

const fixture = {
  recordedFrom: { rpc: rpcUrl, blockNumber: blockNumber.toString() },
  token,
  curve,
  phantomQuote: phantomQuote.toString(),
  launchSupply: launchSupply.toString(),
  expected: {
    realQuoteReserve: realQuoteReserve.toString(),
    tokenReserve: tokenReserve.toString(),
  },
  logs: logs.map(({ address, topics, data, logIndex, blockNumber: block }) => ({
    address,
    topics,
    data,
    logIndex,
    blockNumber: block.toString(),
  })),
};

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  "curve-history",
  `${name}.json`,
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Wrote ${out}: ${logs.length} logs up to block ${blockNumber}`);
