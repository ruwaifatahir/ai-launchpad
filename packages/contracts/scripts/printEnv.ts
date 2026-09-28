// Prints ready-to-paste env blocks for apps/api, apps/indexer and apps/web from
// a deployment file, so no address is ever copied by hand.
//
//   pnpm print-env                                  (newest deployments/*.json)
//   DEPLOYMENT=deployments/target-8453-1759000000000.json pnpm print-env
//
// The RPC URL is not stored in the deployment, because it often carries an API
// key. It is taken from the variable the deploy network read (TARGET_RPC_URL
// for `target`), and left as a placeholder when that is not set here.
import { deploymentPath, readDeployment } from "../lib/deployments.js";

const file = deploymentPath();
const d = readDeployment(file);

const RPC_BY_NETWORK: Record<string, string | undefined> = {
  target: process.env.TARGET_RPC_URL,
  ponsMainnet: process.env.RH_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
  ponsTestnet: process.env.RH_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com/rpc",
};
const rpcUrl = RPC_BY_NETWORK[d.networkName] || "<rpc-url>";

const missing: string[] = [];
const need = (key: string): string => {
  const value = d[key] ?? d.external?.[key];
  if (value === undefined || value === null || value === "") {
    missing.push(key);
    return "";
  }
  return String(value);
};

const blocks: Array<[string, Array<[string, string]>]> = [
  [
    "apps/api/.env",
    [
      ["CHAIN_ID", need("chainId")],
      ["RPC_URL", rpcUrl],
      ["FACTORY_ADDRESS", need("factory")],
      ["POOL_MANAGER_ADDRESS", need("poolManager")],
      ["HOOK_ADDRESS", need("memeHook")],
      ["LOCKER_ADDRESS", need("locker")],
      ["BUYBACK_VAULT_ADDRESS", need("buybackVault")],
    ],
  ],
  [
    "apps/indexer/.env",
    [
      ["CHAIN_ID", need("chainId")],
      ["RPC_URL", rpcUrl],
      ["FACTORY_ADDRESS", need("factory")],
      ["HOOK_ADDRESS", need("memeHook")],
      ["BUYBACK_VAULT_ADDRESS", need("buybackVault")],
      ["LOCKER_ADDRESS", need("locker")],
      ["POOL_MANAGER_ADDRESS", need("poolManager")],
      ["START_BLOCK", need("deployBlock")],
    ],
  ],
  [
    "apps/web/.env",
    [
      ["VITE_CHAIN_ID", need("chainId")],
      ["VITE_RPC_URL", rpcUrl],
      ["VITE_LAUNCH_FACTORY_ADDRESS", need("factory")],
      ["VITE_LAUNCH_AND_BUY_ADDRESS", need("launchAndBuy")],
      ["VITE_MEME_HOOK_ADDRESS", need("memeHook")],
      ["VITE_FEE_ESCROW_ADDRESS", need("feeEscrow")],
      ["VITE_PERMIT2_ADDRESS", need("permit2")],
    ],
  ],
];

console.log(`# from ${file} (${d.networkName}, chain ${d.chainId})`);
for (const [title, vars] of blocks) {
  console.log(`\n# ${title}`);
  for (const [name, value] of vars) console.log(`${name}=${value}`);
}
// The deploy never touches these, so they are not in the file. Uniswap lists them per chain.
console.log("# Uniswap v4 periphery for this chain: https://developers.uniswap.org/docs/protocols/v4/deployments");
console.log("VITE_V4_QUOTER_ADDRESS=");
console.log("VITE_STATE_VIEW_ADDRESS=");
console.log("VITE_UNIVERSAL_ROUTER_ADDRESS=");

if (missing.length) {
  const hints: Record<string, string> = {
    launchAndBuy: "run `pnpm deploy:launch-and-buy` to add the forwarder",
    deployBlock: "this deployment predates block recording; use the block of its PonsV2FeeEscrow deployment",
  };
  console.error(`\nmissing from ${file}:`);
  for (const key of new Set(missing)) console.error(`  ${key}${hints[key] ? `: ${hints[key]}` : ""}`);
  process.exitCode = 1;
}
if (rpcUrl === "<rpc-url>") console.error(`\nRPC URL unknown for network "${d.networkName}"; fill it in by hand.`);
