import type { Signer } from "ethers";
import { EXTERNAL, LAUNCH_CONFIG_0, LIVE_PARAMS } from "../config/pons.js";
import { preflight, resolveUniswapV4 } from "./chain.js";
import { create2Calldata, hasValidHookFlags, mineHookSalt } from "./hookSalt.js";

/** The fields of a factory LaunchConfig, as addLaunchConfig takes them. */
export interface LaunchConfig {
  supply: bigint;
  curveFeeBps: bigint;
  phantomQuote: bigint;
  graduationThreshold: bigint;
  poolFee: number;
  tickSpacing: number;
  enabled: boolean;
}

export interface DeployOptions {
  owner: string;
  protocolFeeRecipient: string;
  launchFee?: bigint;
  poolManager?: string;
  positionManager?: string;
  permit2?: string;
  /** Seed the factory with launch config #0 and enable launching. */
  configure?: boolean;
  /** Launch config #0 when `configure` is set. Defaults to the live Pons figures. */
  launchConfig?: LaunchConfig;
  log?: (msg: string) => void;
}

export interface PonsDeployment {
  feeEscrow: string;
  memeHook: string;
  hookSalt: string;
  buybackVault: string;
  locker: string;
  factory: string;
  graduationGuard: string;
  graduationExecutor: string;
  launchDeployer: string;
  owner: string;
  protocolFeeRecipient: string;
  launchFee: string;
  /** Block of the first deployment transaction, where an indexer should start. */
  deployBlock: number;
  external: { poolManager: string; positionManager: string; permit2: string };
  /** PonsV2LaunchAndBuy, present once the forwarder has been deployed. */
  launchAndBuy?: string;
}

/**
 * Deploys a self-contained Pons V2 instance.
 *
 * Ordering is forced by the constructors: the hook needs the escrow, the vault
 * and factory need the hook, and the executor/deployer need the factory. The
 * hook additionally has to land on a CREATE2-mined address, so it cannot be
 * deployed with a plain `new`.
 *
 * PonsV2GraduationGuard is deliberately absent — the factory constructor
 * deploys it. PonsV2LaunchAndBuy (the launch forwarder) is added separately by
 * deployLaunchAndBuy below; without it `factory.launchTokenFor` reverts with
 * NotLaunchForwarder, which only disables relayed launch-on-behalf. Direct
 * `launchToken` is unaffected.
 *
 * Before anything is sent, the Uniswap V4 addresses are resolved (see
 * lib/chain.ts) and checked on chain, so a wrong or missing address fails for
 * free instead of halfway through a paid deployment.
 */
export async function deployPons(
  ethers: any,
  signer: Signer,
  opts: DeployOptions,
): Promise<PonsDeployment> {
  const log = opts.log ?? (() => {});
  if (process.env.PONS_DEPLOYMENT) return attachPons(ethers, signer, opts, process.env.PONS_DEPLOYMENT);
  const chainId = (await signer.provider!.getNetwork()).chainId;
  // Explicit options win. Anything left unset comes from the environment, and
  // only Robinhood Chain may fall back to the addresses in config/pons.ts.
  const needsEnv = !opts.poolManager || !opts.positionManager || !opts.permit2;
  const fromEnv = needsEnv ? resolveUniswapV4(chainId) : undefined;
  const poolManager = opts.poolManager ?? fromEnv!.poolManager;
  const positionManager = opts.positionManager ?? fromEnv!.positionManager;
  const permit2 = opts.permit2 ?? fromEnv!.permit2;
  const launchFee = opts.launchFee ?? LIVE_PARAMS.launchFee;
  await preflight(signer.provider!, { poolManager, positionManager, permit2 });

  // 1. Fee escrow — no dependencies, but everything downstream needs its address.
  const feeEscrow = await (await ethers.getContractFactory("PonsV2FeeEscrow", signer)).deploy();
  await feeEscrow.waitForDeployment();
  const feeEscrowAddr = await feeEscrow.getAddress();
  // Every event this instance ever emits comes at or after the first contract's block.
  const deployBlock: number = (await feeEscrow.deploymentTransaction()!.wait())!.blockNumber;
  log(`1/7 PonsV2FeeEscrow          ${feeEscrowAddr}`);

  // 2. Meme hook — CREATE2 to an address whose low 14 bits encode its permissions.
  const hookFactory = await ethers.getContractFactory("PonsV2MemeHook", signer);
  const hookInitCode = (
    await hookFactory.getDeployTransaction(poolManager, feeEscrowAddr, opts.protocolFeeRecipient, opts.owner)
  ).data as string;
  const mined = mineHookSalt(hookInitCode);
  await (
    await signer.sendTransaction({
      to: EXTERNAL.create2Deployer,
      data: create2Calldata(mined.salt, hookInitCode),
    })
  ).wait();
  if ((await signer.provider!.getCode(mined.address)) === "0x") {
    throw new Error(`CREATE2 hook deployment produced no code at ${mined.address}`);
  }
  if (!hasValidHookFlags(mined.address)) {
    throw new Error(`Mined hook address ${mined.address} does not carry the required V4 flags`);
  }
  log(`2/7 PonsV2MemeHook           ${mined.address}  (salt ${mined.salt}, ${mined.attempts} attempts)`);

  // 3. Buyback vault — takes the hook as its fee policy source.
  const vault = await (await ethers.getContractFactory("PonsV2BuybackVault", signer)).deploy(
    opts.owner,
    mined.address,
    feeEscrowAddr,
  );
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  log(`3/7 PonsV2BuybackVault       ${vaultAddr}`);

  // 4. Launch locker.
  const locker = await (await ethers.getContractFactory("PonsV2LaunchLocker", signer)).deploy(
    opts.owner,
    positionManager,
  );
  await locker.waitForDeployment();
  const lockerAddr = await locker.getAddress();
  log(`4/7 PonsV2LaunchLocker       ${lockerAddr}`);

  // 5. Factory. Its constructor asserts positionManager.poolManager() == poolManager
  //    and internally deploys PonsV2GraduationGuard.
  const factory = await (await ethers.getContractFactory("PonsV2LaunchFactory", signer)).deploy(
    opts.owner,
    poolManager,
    positionManager,
    permit2,
    lockerAddr,
    mined.address,
    feeEscrowAddr,
    vaultAddr,
    launchFee,
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  const guardAddr = await factory.graduationGuard();
  log(`5/7 PonsV2LaunchFactory      ${factoryAddr}`);
  log(`    PonsV2GraduationGuard    ${guardAddr}  (auto-deployed by the factory)`);

  // 6. Graduation executor.
  const executor = await (await ethers.getContractFactory("PonsV2GraduationExecutor", signer)).deploy(
    positionManager,
    permit2,
    lockerAddr,
    factoryAddr,
  );
  await executor.waitForDeployment();
  const executorAddr = await executor.getAddress();
  log(`6/7 PonsV2GraduationExecutor ${executorAddr}`);

  // 7. Launch deployer.
  const deployer = await (await ethers.getContractFactory("PonsV2LaunchDeployer", signer)).deploy(factoryAddr);
  await deployer.waitForDeployment();
  const deployerAddr = await deployer.getAddress();
  log(`7/7 PonsV2LaunchDeployer     ${deployerAddr}`);

  // Wiring. Each of these is owner-only and the system is inert until all are set.
  const hook = hookFactory.attach(mined.address).connect(signer);
  await (await locker.setFactory(factoryAddr)).wait();
  await (await hook.setFactory(factoryAddr)).wait();
  await (await hook.setBuybackVault(vaultAddr)).wait();
  await (await vault.setFactory(factoryAddr)).wait();
  await (await factory.setGraduationExecutor(executorAddr)).wait();
  await (await factory.setLaunchDeployer(deployerAddr)).wait();
  log(`    wiring complete`);

  if (opts.configure) {
    await (await factory.addLaunchConfig(opts.launchConfig ?? LAUNCH_CONFIG_0)).wait();
    await (await factory.setSnipeTaxStartBps(LIVE_PARAMS.snipeTaxStartBps)).wait();
    await (await factory.setSnipeTaxSeconds(LIVE_PARAMS.snipeTaxSeconds)).wait();
    await (await factory.setMaxCreatorTaxBps(LIVE_PARAMS.maxCreatorTaxBps)).wait();
    await (await factory.setLaunchEnabled(true)).wait();
    log(`    launch config #0 added, launching enabled`);
  }

  return {
    feeEscrow: feeEscrowAddr,
    memeHook: mined.address,
    hookSalt: mined.salt,
    buybackVault: vaultAddr,
    locker: lockerAddr,
    factory: factoryAddr,
    graduationGuard: guardAddr,
    graduationExecutor: executorAddr,
    launchDeployer: deployerAddr,
    owner: opts.owner,
    protocolFeeRecipient: opts.protocolFeeRecipient,
    launchFee: launchFee.toString(),
    deployBlock,
    external: { poolManager, positionManager, permit2 },
  };
}

/**
 * Deploys PonsV2LaunchAndBuy (the launch forwarder) and points the factory at
 * it, which is what makes atomic launch + developer buy possible. `ownerSigner`
 * must own the factory, since setLaunchForwarder is owner-only; the forwarder
 * takes the same owner so both answer to one address.
 */
export async function deployLaunchAndBuy(
  ethers: any,
  signer: Signer,
  ownerSigner: Signer,
  factoryAddress: string,
): Promise<string> {
  const owner = await ownerSigner.getAddress();
  const forwarder = await (await ethers.getContractFactory("PonsV2LaunchAndBuy", signer)).deploy(factoryAddress, owner);
  await forwarder.waitForDeployment();
  const address: string = await forwarder.getAddress();
  const factory = await ethers.getContractAt("PonsV2LaunchFactory", factoryAddress, ownerSigner);
  await (await factory.setLaunchForwarder(address)).wait();
  return address;
}

/**
 * Starts the two-step ownership transfer of every owned contract to
 * `newOwner`, and moves the hook's fee-sweep operator with it.
 *
 * The contracts are deployed owned by the deployer because every wiring call
 * above is owner-only; a separate owner (a multisig, say) could not have made
 * them. All five are Ownable2Step, so nothing changes hands until `newOwner`
 * calls acceptOwnership() on each; until then the deployer still owns them.
 */
export async function handOver(ethers: any, signer: Signer, d: PonsDeployment, newOwner: string): Promise<string[]> {
  const hook = await ethers.getContractAt("PonsV2MemeHook", d.memeHook, signer);
  await (await hook.setFeeSweepOperator(newOwner)).wait();
  const owned: Array<[string, string]> = [
    ["PonsV2LaunchFactory", d.factory],
    ["PonsV2MemeHook", d.memeHook],
    ["PonsV2BuybackVault", d.buybackVault],
    ["PonsV2LaunchLocker", d.locker],
  ];
  if (d.launchAndBuy) owned.push(["PonsV2LaunchAndBuy", d.launchAndBuy]);
  for (const [name, address] of owned) {
    const c = await ethers.getContractAt(name, address, signer);
    await (await c.transferOwnership(newOwner)).wait();
  }
  return owned.map(([, address]) => address);
}

/**
 * FORK-ONLY. Instead of deploying, points the caller at an existing deployment
 * (PONS_DEPLOYMENT=deployments/<file>.json) and hands it over to `opts.owner`
 * by impersonating the recorded owner, so the scenarios run unchanged against
 * live contracts. Impersonation only exists on a simulated network; against a
 * real RPC this throws before sending anything.
 */
async function attachPons(ethers: any, signer: Signer, opts: DeployOptions, file: string): Promise<PonsDeployment> {
  const { readFileSync } = await import("node:fs");
  const d: PonsDeployment = JSON.parse(readFileSync(file, "utf8"));
  const log = opts.log ?? (() => {});
  const newOwner = opts.owner;

  await ethers.provider.send("hardhat_impersonateAccount", [d.owner]);
  await ethers.provider.send("hardhat_setBalance", [d.owner, "0x8ac7230489e80000"]);
  const current = await ethers.getSigner(d.owner);

  const owned = [
    await ethers.getContractAt("PonsV2LaunchFactory", d.factory),
    await ethers.getContractAt("PonsV2MemeHook", d.memeHook),
    await ethers.getContractAt("PonsV2BuybackVault", d.buybackVault),
    await ethers.getContractAt("PonsV2LaunchLocker", d.locker),
  ];
  const hook = owned[1];
  // Fee routing follows the caller's recipient/operator, as a fresh deploy would.
  await (await hook.connect(current).setProtocolFeeRecipient(opts.protocolFeeRecipient)).wait();
  await (await hook.connect(current).setFeeSweepOperator(newOwner)).wait();
  if (newOwner.toLowerCase() !== d.owner.toLowerCase()) {
    for (const c of owned) {
      await (await c.connect(current).transferOwnership(newOwner)).wait();
      await (await c.connect(signer).acceptOwnership()).wait();
    }
  }
  await ethers.provider.send("hardhat_stopImpersonatingAccount", [d.owner]);
  log(`attached to ${file} (factory ${d.factory}), owner -> ${newOwner}`);

  return { ...d, owner: newOwner, protocolFeeRecipient: opts.protocolFeeRecipient };
}
