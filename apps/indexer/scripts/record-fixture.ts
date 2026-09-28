// Dev tool, not part of the indexer: records test fixtures from Pons's live deployment.
//
// Records one Pons mainnet transaction as a test fixture: its logs, its signer and its
// block time, plus Pons's own trades for that transaction as the expected values.
//
//   node scripts/record-fixture.ts <name> <transaction hash> <launch token>
//
// Writes test/fixtures/<name>.json. Pons's trades API returns only a launch's latest 50
// trades and has no reliable paging, so record a transaction soon after it happens.
//
// For a pool trade it also records the launch's pool id, and the hook and PoolManager
// addresses the logs come from.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  getAbiItem,
  getAddress,
  http,
  isAddress,
  isHash,
  parseAbi,
  parseAbiItem,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";

// Defaults are Pons's live deployment on Robinhood Chain mainnet; each can be overridden
// from the environment to record from another deployment of the same contracts.
const rpcUrl = process.env.FIXTURE_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const ponsApi = process.env.FIXTURE_PONS_API_URL ?? "https://www.ponsfamily.com/api";
const factory = envAddress(
  "FIXTURE_FACTORY_ADDRESS",
  "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
);
// Lowercase: it is compared with log addresses as a string.
const hook = envAddress(
  "FIXTURE_HOOK_ADDRESS",
  "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044",
).toLowerCase() as Address;
const poolManager = envAddress(
  "FIXTURE_POOL_MANAGER_ADDRESS",
  "0x8366a39CC670B4001A1121B8F6A443A643e40951",
);

function envAddress(name: string, fallback: Address): Address {
  const value = process.env[name] ?? fallback;
  if (!isAddress(value, { strict: false })) throw new Error(`${name} is not an address`);
  return value;
}

// The hook's events that name the pool a transaction traded in: a user trade, or a fee
// sweep with its buyback and fee conversion.
const hookPoolEvents = [
  parseAbiItem(
    "event HookFeeCollected(bytes32 indexed poolId, address currency, uint256 feeAmount, uint256 taxAmount)",
  ),
  parseAbiItem(
    "event PoolFeesSwept(bytes32 indexed poolId, uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount, uint256 tokensLocked)",
  ),
  parseAbiItem(
    "event PoolConversionSkipped(bytes32 indexed poolId, uint256 retainedMemecoin)",
  ),
];
// Only the first three fields of the hook's LaunchInfo are read.
const launchesAbi = parseAbi([
  "function launches(bytes32 poolId) view returns (bool registered, bool memecoinIsCurrency0, address memecoin)",
]);

const tokenLaunched = getAbiItem({
  abi: [
    {
      type: "event",
      name: "TokenLaunched",
      inputs: [
        { indexed: true, name: "token", type: "address" },
        { indexed: true, name: "curve", type: "address" },
        { indexed: true, name: "deployer", type: "address" },
        { indexed: false, name: "pairToken", type: "address" },
        { indexed: false, name: "launchConfigId", type: "uint256" },
        { indexed: false, name: "graduationThreshold", type: "uint256" },
      ],
    },
  ] as const,
  name: "TokenLaunched",
});

const [name, hash, token] = process.argv.slice(2);
if (
  !name ||
  !/^[a-z0-9-]+$/.test(name) ||
  !isHash(hash ?? "") ||
  !isAddress(token ?? "")
) {
  console.error(
    "Usage: node scripts/record-fixture.ts <name> <transaction hash> <launch token>",
  );
  process.exit(1);
}
const transactionHash = hash as `0x${string}`;
const launchToken = getAddress(token as string);

const client = createPublicClient({ transport: http(rpcUrl) });

const [chainId, receipt, transaction] = await Promise.all([
  client.getChainId(),
  client.getTransactionReceipt({ hash: transactionHash }),
  client.getTransaction({ hash: transactionHash }),
]);
const block = await client.getBlock({ blockNumber: receipt.blockNumber });

// The launch's curve and quote asset come from its TokenLaunched. The launch transaction
// is found through Pons's trades list or the launch list; the factory's own logs are
// cheaper to search by the indexed token.
const [launchLog] = await client.getLogs({
  address: factory,
  event: tokenLaunched,
  args: { token: launchToken },
  fromBlock: 0n,
  toBlock: receipt.blockNumber,
});
if (!launchLog) throw new Error(`No TokenLaunched for ${launchToken} on ${factory}`);
const launched = parseEventLogs({ abi: [tokenLaunched], logs: [launchLog] })[0]!;

const trades = (await (
  await fetch(`${ponsApi}/pons-v2-market/${launchToken}/trades`)
).json()) as { trades: { transactionHash: string }[] };
const ponsTrades = trades.trades.filter(
  (trade) => trade.transactionHash.toLowerCase() === transactionHash.toLowerCase(),
);
if (ponsTrades.length === 0) {
  console.warn(
    `Pons lists no trade of ${launchToken} in ${transactionHash}. It returns only the latest 50.`,
  );
}

// A pool trade finds its launch by pool id: the pool whose HookFeeCollected, PoolFeesSwept
// or PoolConversionSkipped in this transaction the hook maps to the launch token. Unset for
// a curve trade.
let poolId: Hex | undefined;
const poolIds = new Set(
  parseEventLogs({ abi: hookPoolEvents, logs: receipt.logs })
    .filter((log) => log.address.toLowerCase() === hook)
    .map((log) => log.args.poolId),
);
for (const id of poolIds) {
  const [, , poolToken] = await client.readContract({
    address: hook,
    abi: launchesAbi,
    functionName: "launches",
    args: [id],
  });
  if (poolToken.toLowerCase() === launchToken.toLowerCase()) poolId = id;
}

const fixture = {
  recordedFrom: {
    rpc: rpcUrl,
    ponsTrades: `${ponsApi}/pons-v2-market/${launchToken}/trades`,
  },
  chainId,
  launch: {
    token: launched.args.token,
    curve: launched.args.curve,
    creator: launched.args.deployer,
    quoteAsset: launched.args.pairToken,
    ...(poolId ? { poolId } : {}),
  },
  ...(poolId ? { hook, poolManager } : {}),
  transaction: {
    hash: transactionHash,
    from: transaction.from,
    blockNumber: receipt.blockNumber.toString(),
    blockTimestamp: block.timestamp.toString(),
  },
  logs: receipt.logs.map((log) => ({
    address: log.address,
    topics: log.topics,
    data: log.data,
    logIndex: log.logIndex,
  })),
  pons: ponsTrades,
};

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  `${name}.json`,
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  `Wrote ${out}: ${receipt.logs.length} logs, ${ponsTrades.length} Pons trades`,
);
