import { createConfig, factory } from "ponder";
import { getAbiItem } from "viem";

import { PonsV2BondingCurveAbi } from "./abis/PonsV2BondingCurveAbi";
import { PonsV2LaunchFactoryAbi } from "./abis/PonsV2LaunchFactoryAbi";
import { PonsV2LauncherTokenAbi } from "./abis/PonsV2LauncherTokenAbi";
import { PonsV2MemeHookAbi } from "./abis/PonsV2MemeHookAbi";
import { deployment } from "./src/deployments";

const { chainId, startBlock } = deployment;

// Ponder's name for the one chain indexed. Only its logs and its own tables show it.
const chain = "chain";

// RPC_URL first. PONDER_RPC_URL_<chain id>, Ponder's own convention, is the fallback.
const rpc = process.env.RPC_URL?.trim() || process.env[`PONDER_RPC_URL_${chainId}`];
if (!rpc) throw new Error("RPC_URL is not set. See .env.example.");

// Every launch deploys one token and one curve, and TokenLaunched names both.
const tokenLaunched = getAbiItem({ abi: PonsV2LaunchFactoryAbi, name: "TokenLaunched" });

// For the smoke run only: stop every contract at this block. Unset, Ponder follows the
// chain head.
const endBlock = parseEndBlock(process.env.SMOKE_END_BLOCK);

function parseEndBlock(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (!/^\d+$/.test(value)) {
    throw new Error(`SMOKE_END_BLOCK must be a block number, got "${value}"`);
  }
  return Number(value);
}

// Contracts launched by the factory: found from its TokenLaunched.
function launchedBy(parameter: "curve" | "token") {
  return factory({ address: deployment.factory, event: tokenLaunched, parameter });
}

export default createConfig({
  // Postgres always. Without this Ponder falls back to a local PGlite file when
  // DATABASE_URL is missing, and a deploy would index into a container's disk.
  database: {
    kind: "postgres",
    connectionString: process.env.DATABASE_URL,
  },
  chains: {
    [chain]: { id: chainId, rpc },
  },
  // Only contracts with indexing functions are listed: Ponder syncs nothing for the rest.
  // A developer buy through LaunchAndBuy is the curve's own CurveBuy, and the buyback
  // vault and locker are known only by address, in src/deployments.ts, to tag holders.
  contracts: {
    LaunchFactory: {
      chain,
      abi: PonsV2LaunchFactoryAbi,
      address: deployment.factory,
      startBlock,
      endBlock,
    },
    BondingCurve: {
      chain,
      abi: PonsV2BondingCurveAbi,
      address: launchedBy("curve"),
      startBlock,
      endBlock,
    },
    LauncherToken: {
      chain,
      abi: PonsV2LauncherTokenAbi,
      address: launchedBy("token"),
      startBlock,
      endBlock,
    },
    MemeHook: {
      chain,
      abi: PonsV2MemeHookAbi,
      address: deployment.hook,
      startBlock,
      endBlock,
    },
    // Uniswap's PoolManager is not a source: it logs every swap on the chain. Pool trades
    // are found through the hook's events and read from the transaction's receipt; its
    // address is in src/deployments.ts.
  },
});
