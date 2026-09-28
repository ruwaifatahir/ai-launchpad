// Mines a CREATE2 salt that puts PonsV2MemeHook at a V4-valid hook address.
// deploy.ts mines its own salt, so this is only for inspecting one in advance.
// The salt depends on the constructor args, so pass the same ones you will
// deploy with: FEE_ESCROW, POOL_MANAGER and PROTOCOL_FEE_RECIPIENT. The hook
// owner is the signer, as deploy.ts deploys it before any OWNER hand-over.
//
//   FEE_ESCROW=0x... pnpm mine --network target
import { network } from "hardhat";
import { EXTERNAL, REQUIRED_HOOK_BITS } from "../config/pons.js";
import { resolveUniswapV4 } from "../lib/chain.js";
import { mineHookSalt } from "../lib/hookSalt.js";

const { ethers } = await network.getOrCreate();
const [signer] = await ethers.getSigners();

const feeEscrow = process.env.FEE_ESCROW;
if (!feeEscrow) {
  throw new Error("Set FEE_ESCROW to the PonsV2FeeEscrow address the hook will use.");
}
const { poolManager } = resolveUniswapV4((await signer.provider!.getNetwork()).chainId);
const owner = await signer.getAddress();
const protocolFeeRecipient = process.env.PROTOCOL_FEE_RECIPIENT || process.env.OWNER || owner;

const hook = await ethers.getContractFactory("PonsV2MemeHook", signer);
const initCode = (await hook.getDeployTransaction(poolManager, feeEscrow, protocolFeeRecipient, owner)).data!;

const mined = mineHookSalt(initCode);
console.log(`required low-14-bits : 0x${REQUIRED_HOOK_BITS.toString(16)}`);
console.log(`create2 deployer     : ${EXTERNAL.create2Deployer}`);
console.log(`salt                 : ${mined.salt}`);
console.log(`hook address         : ${mined.address}`);
console.log(`attempts             : ${mined.attempts}`);
