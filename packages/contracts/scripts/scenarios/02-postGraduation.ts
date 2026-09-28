// Scenario 2 — everything after the V4 pool is seeded.
//
//   pnpm hardhat run scripts/scenarios/02-postGraduation.ts --network ponsFork
//
// The graduated pool charges no LP fee: `poolFee` is 0 in the launch config, so
// all post-graduation revenue is taken by the hook in `afterSwap` at hookFeeBps.
// This walks that path — swap, fee capture, sweep, escrow, buyback vest — using
// the real Uniswap V4 PoolManager on the fork.
import { network } from "hardhat";
import { EXTERNAL, LAUNCH_CONFIG_0, NATIVE, V4_PERIPHERY } from "../../config/pons.js";
import { deployPons } from "../../lib/deployPons.js";
import { computePoolId, eventsFrom, expectRevert, firstEvent, poolKeyFor, row, step, warp } from "../../lib/forkHarness.js";
import { launchAndGraduate } from "../../lib/graduate.js";

const { ethers } = await network.getOrCreate();
const fmt = (v: bigint, d = 18) => ethers.formatUnits(v, d);

const [deployer, trader, feeRecipient, creator] = await ethers.getSigners();

step(0, "deploy, launch and graduate a pool");
const d = await deployPons(ethers, deployer, {
  owner: deployer.address,
  protocolFeeRecipient: feeRecipient.address,
  configure: true,
  log: () => {},
});
const factory = await ethers.getContractAt("PonsV2LaunchFactory", d.factory, deployer);
const hook = await ethers.getContractAt("PonsV2MemeHook", d.memeHook, deployer);
const escrow = await ethers.getContractAt("PonsV2FeeEscrow", d.feeEscrow, deployer);
const vault = await ethers.getContractAt("PonsV2BuybackVault", d.buybackVault, deployer);
const locker = await ethers.getContractAt("PonsV2LaunchLocker", d.locker, deployer);

const g = await launchAndGraduate(ethers, factory, deployer, trader, {
  name: "Graduated",
  symbol: "GRAD",
  creatorFeeRecipient: creator.address,
  creatorTaxBps: 100,
  buybackEnabled: true,
});
row("token", g.tokenAddress);
row("V4 position id", g.positionId);
row("seeded", `${fmt(g.seedTokenAmount)} GRAD + ${fmt(g.seedQuoteAmount)} native`);

step(1, "the pool key and its id");
const { key, memecoinIsCurrency0 } = poolKeyFor(
  g.tokenAddress,
  NATIVE,
  LAUNCH_CONFIG_0.poolFee,
  LAUNCH_CONFIG_0.tickSpacing,
  d.memeHook,
);
const poolId = computePoolId(key);
row("currency0", `${key.currency0}${key.currency0 === NATIVE ? "  (native)" : ""}`);
row("currency1", key.currency1);
row("fee / tickSpacing", `${key.fee} / ${key.tickSpacing}`);
row("hooks", key.hooks);
row("poolId", poolId);
row("memecoin is currency0?", `${memecoinIsCurrency0}  (native always sorts first)`);

const info = await hook.launches(poolId);
row("registered with the hook?", info.registered);
row("hookFeeBps", `${info.hookFeeBps}  (the pool LP fee is ${key.fee} — the hook takes it all)`);
row("creatorTaxBps", info.creatorTaxBps);
row("protocolFeeShareBps", info.protocolFeeShareBps);
row("buybackBurnBps", info.buybackBurnBps);

step(2, "pool state, read through the live StateView lens");
const stateView = new ethers.Contract(
  V4_PERIPHERY.stateView,
  [
    "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
    "function getLiquidity(bytes32 poolId) view returns (uint128)",
  ],
  ethers.provider,
);
const slot0 = await stateView.getSlot0(poolId);
row("StateView", V4_PERIPHERY.stateView);
row("sqrtPriceX96", slot0.sqrtPriceX96);
row("tick", slot0.tick);
row("lpFee", slot0.lpFee);
row("liquidity", await stateView.getLiquidity(poolId));

step(3, "deploy the test-only swap router");
console.log("   contracts/test/PonsV2TestSwapRouter.sol — not part of the protocol.");
console.log("   It unlocks the PoolManager, swaps, then settles and takes.");
console.log();
const router = await (await ethers.getContractFactory("PonsV2TestSwapRouter", trader)).deploy(EXTERNAL.poolManager);
await router.waitForDeployment();
const routerAddress = await router.getAddress();
row("router", routerAddress);

const token = await ethers.getContractAt("PonsV2LauncherToken", g.tokenAddress, trader);

async function showPending(label: string) {
  row(label, "");
  row("  pendingFees[native]", fmt(await hook.pendingFees(poolId, NATIVE)));
  row("  pendingFees[memecoin]", fmt(await hook.pendingFees(poolId, g.tokenAddress)));
  row("  pendingCreatorTax[native]", fmt(await hook.pendingCreatorTax(poolId, NATIVE)));
  row("  pendingCreatorTax[memecoin]", fmt(await hook.pendingCreatorTax(poolId, g.tokenAddress)));
  row("  pendingBuyback[native]", fmt(await hook.pendingBuyback(poolId, NATIVE)));
}

step(4, "swap native -> GRAD on the graduated pool");
await showPending("before");
const amountIn = ethers.parseEther("0.25");
const beforeTokens = await token.balanceOf(trader.address);
const swap1 = await (
  await router.connect(trader).swapExactIn(key, true, amountIn, 0n, trader.address, { value: amountIn })
).wait();
console.log();
row("sent", `${fmt(amountIn)} native`);
row("received", `${fmt((await token.balanceOf(trader.address)) - beforeTokens)} GRAD`);
for (const ev of eventsFrom(swap1, hook.interface, "HookFeeCollected")) {
  row("HookFeeCollected", `currency ${ev.args.currency === NATIVE ? "native" : "GRAD"}  fee ${fmt(ev.args.feeAmount)}  tax ${fmt(ev.args.taxAmount)}`);
}
console.log();
await showPending("after");
console.log("   Buying takes the fee on the memecoin output leg, so it lands memecoin-denominated.");

step(5, "swap GRAD -> native");
const sellTokens = ((await token.balanceOf(trader.address)) * 30n) / 100n;
await (await token.connect(trader).approve(routerAddress, sellTokens)).wait();
const beforeNative = await ethers.provider.getBalance(trader.address);
const swap2 = await (await router.connect(trader).swapExactIn(key, false, sellTokens, 0n, trader.address)).wait();
row("sent", `${fmt(sellTokens)} GRAD`);
row("received", `~${fmt((await ethers.provider.getBalance(trader.address)) - beforeNative)} native (net of gas)`);
for (const ev of eventsFrom(swap2, hook.interface, "HookFeeCollected")) {
  row("HookFeeCollected", `currency ${ev.args.currency === NATIVE ? "native" : "GRAD"}  fee ${fmt(ev.args.feeAmount)}  tax ${fmt(ev.args.taxAmount)}`);
}
console.log();
await showPending("after");

step(6, "who may sweep");
console.log("   The operator may always sweep. The creator may only sweep when no");
console.log("   internal conversion swap is needed — a memecoin-denominated balance");
console.log("   has to be converted, and that is operator-only.");
console.log();
await expectRevert(
  hook.connect(creator).sweepPoolFees(poolId, 1n, 1n),
  "InternalSwapRequiresOperator",
  "creator sweeps while memecoin fees pending",
);
await expectRevert(
  hook.connect(trader).sweepPoolFees(poolId, 1n, 1n),
  "NotFeeSweepOperator",
  "an unrelated address sweeps",
);

step(7, "sweepPoolFees as the operator");
row("feeSweepOperator", await hook.feeSweepOperator());
row("escrow protocol before", fmt(await escrow.balanceOf(feeRecipient.address)));
row("escrow creator before", fmt(await escrow.balanceOf(creator.address)));
row("vault totalLocked before", `${fmt(await vault.totalLocked(g.tokenAddress))} GRAD`);
console.log();
const sweepReceipt = await (await hook.connect(deployer).sweepPoolFees(poolId, 1n, 1n)).wait();
const sweptEv = firstEvent(sweepReceipt, hook.interface, "PoolFeesSwept");
if (sweptEv) {
  row("-> protocol", fmt(sweptEv.args.protocolAmount));
  row("-> buyback", fmt(sweptEv.args.buybackAmount));
  row("-> creator", fmt(sweptEv.args.creatorAmount));
  row("-> tokens locked", `${fmt(sweptEv.args.tokensLocked)} GRAD`);
}
const skippedConversion = firstEvent(sweepReceipt, hook.interface, "PoolConversionSkipped");
if (skippedConversion) row("conversion skipped", `${fmt(skippedConversion.args.retainedMemecoin)} GRAD retained for a later retry`);
const skippedBuyback = firstEvent(sweepReceipt, hook.interface, "PoolBuybackSkipped");
if (skippedBuyback) row("buyback skipped", `${fmt(skippedBuyback.args.foldedBackQuote)} folded back to the creator`);
console.log();
row("escrow protocol after", fmt(await escrow.balanceOf(feeRecipient.address)));
row("escrow creator after", fmt(await escrow.balanceOf(creator.address)));
row("vault totalLocked after", `${fmt(await vault.totalLocked(g.tokenAddress))} GRAD`);
await showPending("pending after sweep");

step(8, "the buyback vest");
const total = await vault.totalLocked(g.tokenAddress);
if (total === 0n) {
  console.log("   nothing locked for this token — no buyback executed");
} else {
  const duration = await vault.VESTING_DURATION();
  const terms = await vault.vestingTerms(g.tokenAddress);
  row("VESTING_DURATION", `${duration} s  (${Number(duration) / 31536000} years, linear)`);
  row("creator recipient", terms[0]);
  row("protocol recipient", terms[1]);
  row("protocolFeeShareBps", terms[2]);
  row("totalLocked", `${fmt(total)} GRAD`);
  console.log();
  for (const years of [1, 2, 2]) {
    await warp(ethers, years * 365 * 24 * 3600);
    row(`  after +${years}y`, `vested ${fmt(await vault.vestedAmount(g.tokenAddress))}  releasable ${fmt(await vault.releasable(g.tokenAddress))}`);
  }
  console.log();
  await expectRevert(
    vault.connect(trader).release(g.tokenAddress),
    "NotVestBeneficiary",
    "an unrelated address calls release",
  );
  // release() pays both legs at once, but only a beneficiary may trigger it,
  // and it credits the fee escrow rather than transferring the tokens out.
  await (await vault.connect(creator).release(g.tokenAddress)).wait();
  console.log();
  row("totalReleased", `${fmt(await vault.totalReleased(g.tokenAddress))} GRAD`);
  row("still locked", `${fmt(total - (await vault.totalReleased(g.tokenAddress)))} GRAD`);
  row("escrow credit: creator", `${fmt(await escrow.balanceOfToken(terms[0], g.tokenAddress))} GRAD`);
  row("escrow credit: protocol", `${fmt(await escrow.balanceOfToken(terms[1], g.tokenAddress))} GRAD`);
  console.log();
  const creatorBefore = await token.balanceOf(terms[0]);
  await (await escrow.connect(creator)["claimToken(address)"](g.tokenAddress)).wait();
  row("creator claimed", `${fmt((await token.balanceOf(terms[0])) - creatorBefore)} GRAD`);
  console.log();
  console.log("   buybackBurnBps is the share of the creator slice earmarked for buyback,");
  console.log("   not a burn — the bought tokens go into the five-year vest.");
}

step(9, "the liquidity stays locked");
row("locker holds position", await locker.isLocked(g.tokenAddress));
row("position id", await locker.lockedPositions(g.tokenAddress));
row("locked excess supply", `${fmt(await locker.lockedTokenSupply(g.tokenAddress))} GRAD`);
const positionManager = new ethers.Contract(
  EXTERNAL.positionManager,
  ["function ownerOf(uint256 tokenId) view returns (address)"],
  ethers.provider,
);
row("position NFT owner", `${await positionManager.ownerOf(g.positionId)}  (== locker)`);
console.log("   The locker exposes no withdraw path — the position cannot leave.");

console.log("\nscenario 2 complete: V4 swaps, hook fee capture, sweep, escrow and vest all exercised");
