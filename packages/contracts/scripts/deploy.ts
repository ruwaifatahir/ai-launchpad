// Deploys a fresh Pons V2 instance to whichever network --network names.
//
//   pnpm deploy:target
//
// Every chain-specific input comes from the environment (see .env.example):
// POOL_MANAGER, POSITION_MANAGER and PERMIT2 locate Uniswap V4, and the
// pre-flight in lib/chain.ts proves them on chain before anything is sent.
// OWNER, PROTOCOL_FEE_RECIPIENT and LAUNCH_FEE set the protocol's knobs;
// LAUNCH_PHANTOM_QUOTE and LAUNCH_GRADUATION_THRESHOLD size the native curve.
// Defaults mirror the live Robinhood Chain deployment.
import { mkdirSync } from "node:fs";
import { network } from "hardhat";
import { LAUNCH_CONFIG_0, LIVE_PARAMS } from "../config/pons.js";
import { writeDeployment } from "../lib/deployments.js";
import { deployLaunchAndBuy, deployPons, handOver } from "../lib/deployPons.js";

const { ethers, networkName } = await network.getOrCreate();

const [signer] = await ethers.getSigners();
const deployer = await signer.getAddress();
const owner = process.env.OWNER || deployer;
const protocolFeeRecipient = process.env.PROTOCOL_FEE_RECIPIENT || owner;
const launchFee = process.env.LAUNCH_FEE ? BigInt(process.env.LAUNCH_FEE) : LIVE_PARAMS.launchFee;
const withLaunchAndBuy = process.env.LAUNCH_AND_BUY !== "false";
const chainId = (await signer.provider!.getNetwork()).chainId;

// Launch config #0 prices the native-quote curve in wei of the chain's native
// asset. The live figures assume ETH; a chain whose native asset is worth far
// more or less needs its own, or launches graduate at the wrong market cap.
const launchConfig = {
  ...LAUNCH_CONFIG_0,
  phantomQuote: process.env.LAUNCH_PHANTOM_QUOTE ? BigInt(process.env.LAUNCH_PHANTOM_QUOTE) : LAUNCH_CONFIG_0.phantomQuote,
  graduationThreshold: process.env.LAUNCH_GRADUATION_THRESHOLD
    ? BigInt(process.env.LAUNCH_GRADUATION_THRESHOLD)
    : LAUNCH_CONFIG_0.graduationThreshold,
};

console.log(`network             : ${networkName} (chainId ${chainId})`);
console.log(`deployer            : ${deployer}`);
console.log(`owner               : ${owner}`);
console.log(`protocolFeeRecipient: ${protocolFeeRecipient}`);
console.log(`launchFee           : ${launchFee} wei`);
console.log(`phantomQuote        : ${launchConfig.phantomQuote} wei`);
console.log(`graduationThreshold : ${launchConfig.graduationThreshold} wei\n`);

// Deployed owned by the deployer, because the wiring calls are owner-only.
// A different OWNER receives ownership at the end.
const result = await deployPons(ethers, signer, {
  owner: deployer,
  protocolFeeRecipient,
  launchFee,
  configure: process.env.CONFIGURE !== "false",
  launchConfig,
  log: (m) => console.log(m),
});

if (withLaunchAndBuy) {
  result.launchAndBuy = await deployLaunchAndBuy(ethers, signer, signer, result.factory);
  console.log(`    PonsV2LaunchAndBuy       ${result.launchAndBuy}  (factory forwarder set)`);
}

let pendingOwnership: string[] = [];
if (owner.toLowerCase() !== deployer.toLowerCase()) {
  pendingOwnership = await handOver(ethers, signer, result, owner);
  console.log(`\nownership transfer to ${owner} started. It completes when that address calls`);
  console.log(`acceptOwnership() on each of:`);
  for (const a of pendingOwnership) console.log(`  ${a}`);
}

mkdirSync("deployments", { recursive: true });
const out = `deployments/${networkName}-${chainId}-${Date.now()}.json`;
writeDeployment(out, {
  chainId: chainId.toString(),
  networkName,
  // Constructor owner of every contract, which verification needs even after a hand-over.
  deployer,
  ...result,
  owner,
  ...(pendingOwnership.length ? { pendingOwnership } : {}),
});
console.log(`\nsaved ${out}`);
console.log(`next: pnpm print-env   (prints the app env blocks for this deployment)`);
