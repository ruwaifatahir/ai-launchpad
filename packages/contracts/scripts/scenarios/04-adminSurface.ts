// Scenario 4 — the operator's console.
//
//   pnpm hardhat run scripts/scenarios/04-adminSurface.ts --network ponsFork
//
// Every owner-only lever on the factory and the hook, written and read back,
// then the behaviours they actually gate. This is the surface you drive to run
// your own instance — there is no Solidity to change, only these calls.
import { network } from "hardhat";
import { LAUNCH_CONFIG_0, NATIVE, QUOTE_ASSETS } from "../../config/pons.js";
import { deployPons } from "../../lib/deployPons.js";
import { expectRevert, firstEvent, row, step, warp } from "../../lib/forkHarness.js";
import { launch } from "../../lib/launch.js";

const { ethers } = await network.getOrCreate();
const fmt = (v: bigint, d = 18) => ethers.formatUnits(v, d);

const [deployer, trader, feeRecipient, creator, outsider, newOwner] = await ethers.getSigners();

step(0, "deploy a fresh instance");
const d = await deployPons(ethers, deployer, {
  owner: deployer.address,
  protocolFeeRecipient: feeRecipient.address,
  configure: true,
  log: () => {},
});
const factory = await ethers.getContractAt("PonsV2LaunchFactory", d.factory, deployer);
const hook = await ethers.getContractAt("PonsV2MemeHook", d.memeHook, deployer);
const vault = await ethers.getContractAt("PonsV2BuybackVault", d.buybackVault, deployer);
const locker = await ethers.getContractAt("PonsV2LaunchLocker", d.locker, deployer);
row("owner", await factory.owner());

step(1, "factory: the economic levers");
await (await factory.setLaunchFee(ethers.parseEther("0.001"))).wait();
row("launchFee", `${fmt(await factory.launchFee())} native`);
await (await factory.setMaxCreatorTaxBps(500n)).wait();
row("maxCreatorTaxBps", await factory.maxCreatorTaxBps());
await (await factory.setSnipeTaxStartBps(5000n)).wait();
row("snipeTaxStartBps", await factory.snipeTaxStartBps());
await (await factory.setSnipeTaxSeconds(10n)).wait();
row("snipeTaxSeconds", await factory.snipeTaxSeconds());
await (await factory.setLaunchEnabled(false)).wait();
row("launchEnabled", await factory.launchEnabled());
await (await factory.setWhitelistedLauncher(trader.address, true)).wait();
row("whitelistedLaunchers[trader]", await factory.whitelistedLaunchers(trader.address));

step(2, "launch configs");
row("launchConfigCount", await factory.launchConfigCount());
const second = {
  supply: 500_000_000n * 10n ** 18n,
  curveFeeBps: 200n,
  phantomQuote: LAUNCH_CONFIG_0.phantomQuote,
  graduationThreshold: LAUNCH_CONFIG_0.graduationThreshold,
  poolFee: 0,
  tickSpacing: 200,
  enabled: true,
};
await (await factory.addLaunchConfig(second)).wait();
row("launchConfigCount", await factory.launchConfigCount());
const cfg1 = await factory.getLaunchConfig(1n);
row("config #1 supply / feeBps", `${fmt(cfg1[0])} / ${cfg1[1]}`);
await (await factory.updateLaunchConfig(1n, { ...second, enabled: false })).wait();
row("config #1 enabled", (await factory.getLaunchConfig(1n))[6]);
console.log();
console.log("   Bounds are enforced, not advisory:");
await expectRevert(factory.setMaxCreatorTaxBps(1001n), "InvalidBasisPoints", "maxCreatorTaxBps above 10%");
await expectRevert(
  factory.addLaunchConfig({ ...second, curveFeeBps: 1001n }),
  "CurveFeeTooHigh",
  "a config with a curve fee above 10%",
);

step(3, "the whitelist gate");
console.log("   With launching disabled, only whitelisted addresses may launch.");
console.log();
await expectRevert(
  launch(ethers, factory, deployer, { symbol: "NOPE", creatorTaxBps: 100 }),
  "NotWhitelisted",
  "a non-whitelisted address launches while disabled",
);
row("canLaunch(deployer)", await factory.canLaunch(deployer.address));
row("canLaunch(trader)", await factory.canLaunch(trader.address));
const whitelisted = await launch(ethers, factory, trader, { symbol: "WLT", creatorTaxBps: 100 });
row("whitelisted launch", whitelisted.tokenAddress);

await (await factory.setLaunchEnabled(true)).wait();
row("launchEnabled", await factory.launchEnabled());

step(4, "the fee gate and the tax ceiling");
await expectRevert(
  factory.connect(trader)[
    "launchToken((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address)"
  ](
    {
      name: "Underpaid",
      symbol: "UND",
      logo: "",
      description: "",
      socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
      creatorFeeRecipient: trader.address,
      creatorTaxBps: 100,
      buybackEnabled: false,
      expectedEconomics: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
    },
    0n,
    NATIVE,
    { value: 1n },
  ),
  "LaunchFeeNotPaid",
  "launch paying the wrong fee",
);
await expectRevert(
  launch(ethers, factory, deployer, { symbol: "TAX", creatorTaxBps: 600 }),
  "CreatorTaxTooHigh",
  `creatorTaxBps above the ${await factory.maxCreatorTaxBps()} ceiling`,
);
await expectRevert(
  launch(ethers, factory, deployer, { symbol: "OFF", launchConfigId: 1n }),
  "LaunchConfigDisabled",
  "launch against a disabled config",
);
await expectRevert(
  launch(ethers, factory, deployer, { symbol: "BAD", launchConfigId: 99n, expectedEconomics: ethers.ZeroHash }),
  "InvalidLaunchConfigId",
  "launch against a config that does not exist",
);

step(5, "wiring levers");
console.log("   These are what make a fresh deployment live. Each is one-way-ish:");
console.log("   setting them wrong takes the system down until corrected.");
console.log();
row("graduationExecutor", await factory.graduationExecutor());
row("launchDeployer", await factory.launchDeployer());
row("launchForwarder", `${await factory.launchForwarder()}  (unset — PonsV2LaunchAndBuy skipped)`);
row("graduationGuard", `${await factory.graduationGuard()}  (deployed by the constructor)`);
row("locker.factory", await locker.factory());
row("hook.factory", await hook.factory());
row("vault.factory", await vault.factory());
console.log();
await expectRevert(hook.setFactory(d.factory), "AlreadySet", "re-pointing the hook at another factory");

step(6, "hook: the fee policy");
for (const [name, setter, getter, value] of [
  ["protocolFeeShareBps", "setProtocolFeeShareBps", "protocolFeeShareBps", 4000n],
  ["buybackBurnBps", "setBuybackBurnBps", "buybackBurnBps", 6000n],
  ["hookFeeBps", "setHookFeeBps", "hookFeeBps", 150n],
  ["maxInternalPriceImpactBps", "setMaxInternalPriceImpactBps", "maxInternalPriceImpactBps", 500n],
] as const) {
  const before = await (hook as any)[getter]();
  await (await (hook as any)[setter](value)).wait();
  row(name, `${before} -> ${await (hook as any)[getter]()}`);
}
await (await hook.setProtocolFeeRecipient(outsider.address)).wait();
row("protocolFeeRecipient", await hook.protocolFeeRecipient());
await (await hook.setFeeSweepOperator(trader.address)).wait();
row("feeSweepOperator", await hook.feeSweepOperator());
console.log();
await expectRevert(hook.setHookFeeBps(10_001n), "InvalidBps", "hookFeeBps above 100%");
await expectRevert(hook.connect(outsider).setHookFeeBps(1n), "OwnableUnauthorizedAccount", "a non-owner sets hookFeeBps");

step(7, "the policy is frozen per launch");
console.log("   currentFeePolicy() is snapshotted into each launch, so changing the");
console.log("   hook afterwards cannot retroactively re-price a live curve.");
console.log();
const policy = await hook.currentFeePolicy();
row("hook now: protocolFeeShareBps", policy.protocolFeeShareBps);
row("hook now: hookFeeBps", policy.hookFeeBps);
const before = await ethers.getContractAt("PonsV2BondingCurve", whitelisted.curveAddress);
row("curve launched earlier", `protocolFeeShareBps ${await before.protocolFeeShareBps()}, hookFeeBps unchanged`);
row("  its buybackBurnBps", await before.buybackBurnBps());
console.log("   The earlier curve keeps the 3000/5000 policy it launched under.");

step(8, "creator fee recipient: two different paths");
const tokenAddress = whitelisted.tokenAddress;
console.log("   The creator's own handoff is immediate. Only the protocol owner's");
console.log("   override is timelocked — it is a notice period, not a creator veto.");
console.log();
row("current recipient", (await factory.getLaunchedToken(tokenAddress)).creatorFeeRecipient);
row("CREATOR_FEE_RECIPIENT_TIMELOCK", `${await factory.CREATOR_FEE_RECIPIENT_TIMELOCK()} s`);
row("execution window", `${await factory.CREATOR_FEE_RECIPIENT_EXECUTION_WINDOW()} s`);
console.log();

console.log("   a) creator hands off — takes effect at once");
await expectRevert(
  factory.connect(outsider).transferCreatorFeeRecipient(tokenAddress, outsider.address),
  "NotCreatorFeeRecipient",
  "an outsider hands off someone else's fees",
);
await (await factory.connect(trader).transferCreatorFeeRecipient(tokenAddress, creator.address)).wait();
row("recipient", (await factory.getLaunchedToken(tokenAddress)).creatorFeeRecipient);
row("pending override", (await factory.pendingCreatorFeeRecipient(tokenAddress))[0]);

console.log();
console.log("   b) owner override — proposed now, executable after the timelock");
await (await factory.setCreatorFeeRecipient(tokenAddress, outsider.address)).wait();
const proposal = await factory.pendingCreatorFeeRecipient(tokenAddress);
row("pending recipient", proposal[0]);
row("effectiveAt", proposal[1]);
row("expiresAt", proposal[2]);
await expectRevert(
  factory.executeCreatorFeeRecipientChange(tokenAddress),
  "TimelockNotElapsed",
  "execute before the timelock elapses",
);
console.log();
console.log("   A creator transfer while a proposal is pending does NOT cancel it —");
console.log("   the matured override still supersedes whatever the creator set.");
await (await factory.connect(creator).transferCreatorFeeRecipient(tokenAddress, trader.address)).wait();
row("recipient after creator move", (await factory.getLaunchedToken(tokenAddress)).creatorFeeRecipient);
await warp(ethers, Number(await factory.CREATOR_FEE_RECIPIENT_TIMELOCK()) + 1);
// Execution is permissionless once matured.
await (await factory.connect(outsider).executeCreatorFeeRecipientChange(tokenAddress)).wait();
row("recipient after execute", `${(await factory.getLaunchedToken(tokenAddress)).creatorFeeRecipient}  (the override won)`);

console.log();
console.log("   c) the owner can also cancel a proposal before it matures");
await (await factory.setCreatorFeeRecipient(tokenAddress, creator.address)).wait();
row("pending", (await factory.pendingCreatorFeeRecipient(tokenAddress))[0]);
await (await factory.cancelCreatorFeeRecipientChange(tokenAddress)).wait();
row("pending after cancel", (await factory.pendingCreatorFeeRecipient(tokenAddress))[0]);
await expectRevert(
  factory.cancelCreatorFeeRecipientChange(tokenAddress),
  "NoPendingChange",
  "cancel when nothing is pending",
);

step(9, "two-step ownership on every owned contract");
console.log("   Ownable2Step: a transfer is a proposal until the new owner accepts.");
console.log("   renounceOwnership reverts — these cannot be orphaned.");
console.log();
for (const [name, contract] of [
  ["factory", factory],
  ["hook", hook],
  ["vault", vault],
  ["locker", locker],
] as const) {
  await (await (contract as any).transferOwnership(newOwner.address)).wait();
  const pendingOwner = await (contract as any).pendingOwner();
  await expectRevert(
    (contract as any).connect(outsider).acceptOwnership(),
    "OwnableUnauthorizedAccount",
    `${name}: wrong address accepts`,
  );
  await (await (contract as any).connect(newOwner).acceptOwnership()).wait();
  row(`${name} owner`, `${await (contract as any).owner()}  (pending was ${pendingOwner})`);
}
console.log();
await expectRevert(factory.connect(newOwner).renounceOwnership(), "OwnershipCannotBeRenounced", "renounce the factory");
await expectRevert(
  factory.setLaunchFee(0n),
  "OwnableUnauthorizedAccount",
  "the old owner still tries to set a fee",
);

console.log("\nscenario 4 complete: every owner lever exercised, and every gate held");
void firstEvent;
void QUOTE_ASSETS;
