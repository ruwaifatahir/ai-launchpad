// Scenario 5 — the reverts and the escape hatches.
//
//   pnpm hardhat run scripts/scenarios/05-failurePaths.ts --network ponsFork
//
// What the system does when things go wrong, and what the owner can still do
// about it. Also answers the open question from the deployment: what does
// skipping the optional PonsV2LaunchAndBuy actually cost?
import { network } from "hardhat";
import { LAUNCH_CONFIG_0, NATIVE } from "../../config/pons.js";
import { deployPons } from "../../lib/deployPons.js";
import { computePoolId, eventsFrom, expectRevert, firstEvent, poolKeyFor, row, step, warp } from "../../lib/forkHarness.js";
import { launch } from "../../lib/launch.js";
import { launchAndGraduate } from "../../lib/graduate.js";

const { ethers } = await network.getOrCreate();
const fmt = (v: bigint, d = 18) => ethers.formatUnits(v, d);
const LAUNCH_SIG =
  "launchToken((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address)";

const [deployer, trader, feeRecipient, creator, outsider] = await ethers.getSigners();

const emptyParams = (symbol: string, extra: Record<string, unknown> = {}) => ({
  name: symbol,
  symbol,
  logo: "",
  description: "",
  socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
  creatorFeeRecipient: deployer.address,
  creatorTaxBps: 100,
  buybackEnabled: true,
  expectedEconomics: ethers.ZeroHash,
  salt: ethers.hexlify(ethers.randomBytes(32)),
  ...extra,
});

step(0, "deploy a fresh instance");
const d = await deployPons(ethers, deployer, {
  owner: deployer.address,
  protocolFeeRecipient: feeRecipient.address,
  configure: true,
  log: () => {},
});
const factory = await ethers.getContractAt("PonsV2LaunchFactory", d.factory, deployer);
const hook = await ethers.getContractAt("PonsV2MemeHook", d.memeHook, deployer);
const escrow = await ethers.getContractAt("PonsV2FeeEscrow", d.feeEscrow, deployer);

step(1, "the cost of skipping PonsV2LaunchAndBuy");
console.log("   The forwarder is the only caller factory.launchTokenFor accepts. Without");
console.log("   it there is no launch-on-behalf / relayed launch — nothing else changes.");
console.log();
row("launchForwarder", await factory.launchForwarder());
await expectRevert(
  factory.launchTokenFor(emptyParams("FWD"), 0n, NATIVE, trader.address, [], { value: await factory.launchFee() }),
  "NotLaunchForwarder",
  "launchTokenFor with no forwarder set",
);

console.log();
console.log("   Deploying it is two calls — constructor plus one setter:");
const forwarder = await (await ethers.getContractFactory("PonsV2LaunchAndBuy", deployer)).deploy(
  d.factory,
  deployer.address,
);
await forwarder.waitForDeployment();
const forwarderAddress = await forwarder.getAddress();
await (await factory.setLaunchForwarder(forwarderAddress)).wait();
row("PonsV2LaunchAndBuy", forwarderAddress);
row("factory.launchForwarder", await factory.launchForwarder());

const launchFee = await factory.launchFee();
const devBuy = ethers.parseEther("0.3");
const receipt = await (
  await forwarder
    .connect(trader)
    .launchAndBuy(emptyParams("ATOMIC", { creatorFeeRecipient: trader.address }), 0n, NATIVE, devBuy, 0n, trader.address, [], {
      value: launchFee + devBuy,
    })
).wait();
const atomicEv = firstEvent(receipt, factory.interface, "TokenLaunched")!;
const atomicToken = await ethers.getContractAt("PonsV2LauncherToken", atomicEv.args.token, trader);
console.log();
row("launched + bought atomically", atomicEv.args.token);
row("deployer recorded as", atomicEv.args.deployer);
row("trader token balance", `${fmt(await atomicToken.balanceOf(trader.address))} ATOMIC`);
console.log("   The launcher is snipe-tax exempt, so the atomic dev buy is untaxed even");
console.log("   though it lands in the launch second.");

step(2, "pinning launch economics");
console.log("   expectedEconomics pins the terms a creator was quoted. Every input to");
console.log("   it is owner-mutable, so the pin is what stops a launch from landing on");
console.log("   different terms than the ones shown.");
console.log();
const pinned = await factory.previewLaunchEconomics(0n, NATIVE);
row("previewLaunchEconomics(0, native)", pinned);
await (await hook.setHookFeeBps(250n)).wait();
row("owner changes hookFeeBps to", await hook.hookFeeBps());
row("preview now", await factory.previewLaunchEconomics(0n, NATIVE));
console.log();
await expectRevert(
  factory[LAUNCH_SIG](emptyParams("PIN", { expectedEconomics: pinned }), 0n, NATIVE, { value: launchFee }),
  "LaunchEconomicsMismatch",
  "launch against a stale pin",
);
await (await hook.setHookFeeBps(100n)).wait();
row("restored hookFeeBps", await hook.hookFeeBps());
console.log("   Passing bytes32(0) opts out of the pin entirely — the launch takes");
console.log("   whatever terms are current.");

step(3, "slippage, both directions");
const { curveAddress, token, curve } = await launch(ethers, factory, deployer, {
  symbol: "SLIP",
  creatorFeeRecipient: creator.address,
});
await warp(ethers, Number(await factory.snipeTaxSeconds()) + 1);
const buyIn = ethers.parseEther("0.5");
await expectRevert(
  curve.connect(trader).buy(buyIn, ethers.parseEther("999999999999"), trader.address, { value: buyIn }),
  "SlippageExceeded",
  "buy demanding impossible output",
);
await (await curve.connect(trader).buy(buyIn, 0n, trader.address, { value: buyIn })).wait();
const held = await token.balanceOf(trader.address);
await (await token.connect(trader).approve(curveAddress, held)).wait();
await expectRevert(
  curve.connect(trader).sell(held / 10n, ethers.parseEther("100"), trader.address),
  "SlippageExceeded",
  "sell demanding impossible output",
);
await expectRevert(curve.connect(trader).buy(0n, 0n, trader.address, { value: 0n }), "ZeroAmount", "buy nothing");
await expectRevert(
  curve.connect(trader).buy(buyIn, 0n, ethers.ZeroAddress, { value: buyIn }),
  "ZeroAddress",
  "buy to the zero address",
);

step(4, "the sell side closes before graduation settles");
console.log("   The curve stops accepting sells the moment it is ready to graduate,");
console.log("   not when the flag flips. Otherwise a sell landing in that window would");
console.log("   re-deepen the pool seed at a cheaper price than the reserve fixes it at.");
console.log();
let guard = 0;
while (!(await curve.graduated()) && !(await curve.readyToGraduate()) && guard++ < 30) {
  const chunk = ethers.parseEther("1");
  await (await curve.connect(trader).buy(chunk, 0n, trader.address, { value: chunk })).wait();
}
row("readyToGraduate", await curve.readyToGraduate());
row("graduated", await curve.graduated());
await expectRevert(
  curve.connect(trader).sell(1000n, 0n, trader.address),
  "CurveGraduated",
  "sell once the curve is ready",
);
await expectRevert(
  curve.connect(trader).buy(ethers.parseEther("0.1"), 0n, trader.address, { value: ethers.parseEther("0.1") }),
  "CurveGraduated",
  "buy once the curve is ready",
);

step(5, "forceSweptGraduation cannot take a healthy launch");
console.log("   Three guards stand in front of it, in this order: the launch must be");
console.log("   NotGraduated, it must be ready, and its seed must be one the preflight");
console.log("   actually refuses. Only a launch that fails to seed can be force-swept.");
console.log();
const slipToken = await curve.token();
const fresh = await launch(ethers, factory, deployer, { symbol: "FRESH", creatorFeeRecipient: creator.address });
await expectRevert(
  factory.forceSweptGraduation(fresh.tokenAddress),
  "NotReadyToGraduate",
  "force-sweep a launch still trading",
);
await expectRevert(
  factory.forceSweptGraduation(slipToken),
  "WrongGraduationPhase",
  "force-sweep a launch already swept",
);
await expectRevert(
  factory.connect(outsider).forceSweptGraduation(fresh.tokenAddress),
  "OwnableUnauthorizedAccount",
  "a non-owner force-sweeps",
);
console.log();
console.log("   The third guard, GraduationStillViable, only bites in the window where a");
console.log("   curve is ready but not yet graduated — which is exactly the state an");
console.log("   ERC-20 quote lands in when auto-graduation runs out of gas (scenario 3).");

step(6, "the delayed rescue path");
console.log("   Phase one of graduation is irreversible: the curve is marked graduated");
console.log("   and its reserves move to the factory. If the seed can never succeed, the");
console.log("   reserves would have no exit — rescueSweptGraduation is that exit, behind");
console.log("   a delay so it cannot be used to front-run a normal graduation.");
console.log();
let launched = await factory.getLaunchedToken(slipToken);
if (launched.phase === 0n) await (await factory.graduate(slipToken)).wait();
launched = await factory.getLaunchedToken(slipToken);
row("phase", `${launched.phase}  (1 = Swept)`);
row("sweptQuote", `${fmt(launched.sweptQuote)} native`);
row("sweptTokens", `${fmt(launched.sweptTokens)} SLIP`);
row("GRADUATION_RESCUE_DELAY", `${await factory.GRADUATION_RESCUE_DELAY()} s`);
console.log();
await expectRevert(
  factory.rescueSweptGraduation(slipToken, outsider.address),
  "GraduationRescueTooEarly",
  "rescue before the delay elapses",
);
await expectRevert(
  factory.connect(outsider).rescueSweptGraduation(slipToken, outsider.address),
  "OwnableUnauthorizedAccount",
  "a non-owner rescues",
);
await warp(ethers, Number(await factory.GRADUATION_RESCUE_DELAY()) + 1);
const rescueBefore = await ethers.provider.getBalance(outsider.address);
await (await factory.rescueSweptGraduation(slipToken, outsider.address)).wait();
launched = await factory.getLaunchedToken(slipToken);
row("phase after rescue", `${launched.phase}  (3 = Rescued)`);
row("native returned", fmt((await ethers.provider.getBalance(outsider.address)) - rescueBefore));
row("tokens returned", `${fmt(await token.balanceOf(outsider.address))} SLIP`);
await expectRevert(
  factory.createGraduatedPool(slipToken),
  "WrongGraduationPhase",
  "seed a pool after a rescue",
);

step(7, "rescuing pool fees on a graduated launch");
console.log("   The hook's owner-only escape hatch for fees that can no longer reach the");
console.log("   escrow through the normal exact-delivery path. It bypasses both the");
console.log("   escrow and the buyback conversion and pays the regular split directly.");
console.log();
const g = await launchAndGraduate(ethers, factory, deployer, trader, {
  symbol: "RESC",
  creatorFeeRecipient: creator.address,
  creatorTaxBps: 100,
  buybackEnabled: true,
});
const { key } = poolKeyFor(g.tokenAddress, NATIVE, LAUNCH_CONFIG_0.poolFee, LAUNCH_CONFIG_0.tickSpacing, d.memeHook);
const poolId = computePoolId(key);
const router = await (await ethers.getContractFactory("PonsV2TestSwapRouter", trader)).deploy(d.external.poolManager);
await router.waitForDeployment();
const swapIn = ethers.parseEther("0.25");
await (await router.connect(trader).swapExactIn(key, true, swapIn, 0n, trader.address, { value: swapIn })).wait();
const gradToken = await ethers.getContractAt("PonsV2LauncherToken", g.tokenAddress, trader);
row("pendingFees[memecoin]", fmt(await hook.pendingFees(poolId, g.tokenAddress)));
row("pendingCreatorTax[memecoin]", fmt(await hook.pendingCreatorTax(poolId, g.tokenAddress)));
console.log();
await expectRevert(
  hook.connect(outsider).rescuePoolFees(poolId),
  "OwnableUnauthorizedAccount",
  "a non-owner rescues pool fees",
);
await expectRevert(
  hook.rescuePoolFees(ethers.hexlify(ethers.randomBytes(32))),
  "UnknownPool",
  "rescue a pool the hook does not know",
);
const protocolBefore = await gradToken.balanceOf(await hook.protocolFeeRecipient());
const creatorBefore = await gradToken.balanceOf(creator.address);
const rescueReceipt = await (await hook.rescuePoolFees(poolId)).wait();
for (const ev of eventsFrom(rescueReceipt, hook.interface, "PoolFeesRescued")) {
  row("PoolFeesRescued", `protocol ${fmt(ev.args.protocolAmount)}  creator ${fmt(ev.args.creatorAmount)}`);
}
row("protocol received", `${fmt((await gradToken.balanceOf(await hook.protocolFeeRecipient())) - protocolBefore)} RESC`);
row("creator received", `${fmt((await gradToken.balanceOf(creator.address)) - creatorBefore)} RESC`);
row("paid direct, not via escrow", `escrow credit ${fmt(await escrow.balanceOfToken(creator.address, g.tokenAddress))}`);
await expectRevert(hook.rescuePoolFees(poolId), "NothingToRescue", "rescue again with nothing pending");

console.log("\nscenario 5 complete: every gate held, and every escape hatch worked");
