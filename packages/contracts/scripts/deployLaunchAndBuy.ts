// Adds PonsV2LaunchAndBuy (the launch forwarder) to an existing deployment and
// points the factory at it. Enables atomic launch + developer buy.
//
// deploy.ts already does this unless LAUNCH_AND_BUY=false, so this script is
// only for a deployment made without it, or one made before it existed:
//
//   pnpm deploy:launch-and-buy                         (target network)
//   pnpm hardhat run scripts/deployLaunchAndBuy.ts --network ponsTestnet
//
// Uses the newest deployments/<network>-*.json (override with DEPLOYMENT=path)
// and writes the forwarder address back into it. The signer must own the
// factory. On a *Fork network the factory owner is impersonated for the setter
// and nothing is written.
import { network } from "hardhat";
import { deploymentPath, readDeployment, writeDeployment } from "../lib/deployments.js";
import { deployLaunchAndBuy } from "../lib/deployPons.js";
import { row } from "../lib/forkHarness.js";

const { ethers, networkName } = await network.getOrCreate();
const [signer] = await ethers.getSigners();
const isFork = networkName.endsWith("Fork");
const baseName = networkName.replace(/Fork$/, "");

const file = deploymentPath(baseName);
const d = readDeployment(file);

const factory = await ethers.getContractAt("PonsV2LaunchFactory", d.factory, signer);
const factoryOwner: string = await factory.owner();

row("deployment", file);
row("network", networkName);
row("signer", await signer.getAddress());
row("factory", d.factory);
row("factory owner", factoryOwner);
row("current forwarder", await factory.launchForwarder());

let ownerSigner: any = signer;
if (factoryOwner.toLowerCase() !== (await signer.getAddress()).toLowerCase()) {
  if (!isFork) {
    throw new Error(
      `The signer is not the factory owner (${factoryOwner}). Set DEPLOYER_PRIVATE_KEY to that owner's key.`,
    );
  }
  await ethers.provider.send("hardhat_impersonateAccount", [factoryOwner]);
  await ethers.provider.send("hardhat_setBalance", [factoryOwner, "0x56BC75E2D63100000"]);
  ownerSigner = await ethers.getSigner(factoryOwner);
}

const forwarderAddress = await deployLaunchAndBuy(ethers, signer, ownerSigner, d.factory);
row("PonsV2LaunchAndBuy", forwarderAddress);
row("factory.launchForwarder", await factory.launchForwarder());

if (!isFork) {
  d.launchAndBuy = forwarderAddress;
  writeDeployment(file, d);
  console.log(`\nsaved ${file}`);
}
