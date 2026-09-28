// Scenario 1 — core lifecycle and economics, with the arithmetic made visible.
//
//   pnpm hardhat run scripts/scenarios/01-lifecycle.ts --network ponsFork
//
// Deploys a fresh Pons V2 instance against the forked chain, then walks a launch
// from first buy to graduated pool, reconciling every fee against the balances
// the curve actually holds.
import { network } from "hardhat";
import { LAUNCH_CONFIG_0 } from "../../config/pons.js";
import { deployPons } from "../../lib/deployPons.js";
import { firstEvent, row, step, warp } from "../../lib/forkHarness.js";
import { launch } from "../../lib/launch.js";

const { ethers } = await network.getOrCreate();
const fmt = (v: bigint | number, d = 18) => ethers.formatUnits(v, d);
const pct = (part: bigint, whole: bigint) =>
  whole === 0n ? "-" : `${(Number((part * 10000n) / whole) / 100).toFixed(2)}%`;

const [deployer, trader, feeRecipient, creator] = await ethers.getSigners();

step(0, "fork + fresh Pons V2 instance");
row("block", await ethers.provider.getBlockNumber());
row("chainId", (await ethers.provider.getNetwork()).chainId);
const d = await deployPons(ethers, deployer, {
  owner: deployer.address,
  protocolFeeRecipient: feeRecipient.address,
  configure: true,
  log: (m) => console.log(`   ${m}`),
});

const factory = await ethers.getContractAt("PonsV2LaunchFactory", d.factory, deployer);
const hook = await ethers.getContractAt("PonsV2MemeHook", d.memeHook, deployer);
const escrow = await ethers.getContractAt("PonsV2FeeEscrow", d.feeEscrow, deployer);
const vault = await ethers.getContractAt("PonsV2BuybackVault", d.buybackVault, deployer);
const locker = await ethers.getContractAt("PonsV2LaunchLocker", d.locker, deployer);

step(1, "launch");
const { tokenAddress, curveAddress, token, curve } = await launch(ethers, factory, deployer, {
  name: "Lifecycle",
  symbol: "LIFE",
  creatorFeeRecipient: creator.address,
  creatorTaxBps: 100,
  buybackEnabled: true,
});
row("token", tokenAddress);
row("curve", curveAddress);
row("supply", `${fmt(await curve.launchSupply())} LIFE`);
row("phantomQuote (virtual reserve)", `${fmt(await curve.phantomQuote())} native`);
row("graduationThreshold", `${fmt(await curve.graduationThreshold())} native`);
row("reservedTokens (pool share)", `${fmt(await curve.reservedTokens())} LIFE`);
row("curveFeeBps / creatorTaxBps", `${await curve.feeBps()} / ${await curve.creatorTaxBps()}`);
row("protocolFeeShareBps (frozen)", await curve.protocolFeeShareBps());
row("buybackBurnBps (frozen)", await curve.buybackBurnBps());

step(2, "snipe tax: the launch-second anti-sniper ramp");
row("snipeTaxStartBps", await factory.snipeTaxStartBps());
row("snipeTaxSeconds", await factory.snipeTaxSeconds());
row("launcher exempt?", `${await curve.snipeTaxExempt(deployer.address)}  (auto-exempted at launch)`);
row("creator recipient exempt?", await curve.snipeTaxExempt(creator.address));
console.log();
const windowSeconds = Number(await factory.snipeTaxSeconds());
for (let t = 0; t <= windowSeconds + 1; t++) {
  const traderBps = await curve.currentSnipeTaxBps(trader.address);
  const launcherBps = await curve.currentSnipeTaxBps(deployer.address);
  row(`  t = +${t}s`, `trader ${String(traderBps).padStart(4)} bps    launcher ${String(launcherBps).padStart(4)} bps`);
  if (t <= windowSeconds) await warp(ethers, 1);
}

step(3, "a steady-state buy, reconciled");
const feeBefore = await curve.quoteFeeBalance();
const taxBefore = await curve.creatorTaxBalance();
const buyIn = ethers.parseEther("0.5");
const buyReceipt = await (await curve.connect(trader).buy(buyIn, 0n, trader.address, { value: buyIn })).wait();
const buyEv = firstEvent(buyReceipt, curve.interface, "CurveBuy")!;
const spent: bigint = buyEv.args.quoteIn;
const fee: bigint = buyEv.args.fee;
const tax: bigint = buyEv.args.tax;
row("sent", `${fmt(buyIn)} native`);
row("spent (after any refund)", `${fmt(spent)} native`);
row("curve fee", `${fmt(fee)}  = ${pct(fee, spent)} of spend`);
row("creator tax", `${fmt(tax)}  = ${pct(tax, spent)} of spend`);
row("tokens out", `${fmt(buyEv.args.tokensOut)} LIFE`);
row("quoteFeeBalance delta", fmt((await curve.quoteFeeBalance()) - feeBefore));
row("creatorTaxBalance delta", fmt((await curve.creatorTaxBalance()) - taxBefore));
row("buyback earmark", `${fmt(await curve.buybackQuoteBalance())} native`);
const [quoteReserve, tokenReserve] = await curve.getReserves();
row("reserves quote / tokens", `${fmt(quoteReserve)} / ${fmt(tokenReserve)}`);

step(4, "a sell, reconciled");
const held = await token.balanceOf(trader.address);
const sellAmount = held / 4n;
await (await token.connect(trader).approve(curveAddress, sellAmount)).wait();
const sellReceipt = await (await curve.connect(trader).sell(sellAmount, 0n, trader.address)).wait();
const sellEv = firstEvent(sellReceipt, curve.interface, "CurveSell")!;
const gross: bigint = sellEv.args.quoteOut + sellEv.args.fee + sellEv.args.tax;
row("tokens in", `${fmt(sellEv.args.tokensIn)} LIFE`);
row("gross quote out", fmt(gross));
row("curve fee", `${fmt(sellEv.args.fee)}  = ${pct(sellEv.args.fee, gross)} of gross`);
row("creator tax", `${fmt(sellEv.args.tax)}  = ${pct(sellEv.args.tax, gross)} of gross`);
row("net to seller", fmt(sellEv.args.quoteOut));
console.log("   fees ride the quote leg on both sides, so they are always quote-denominated");

step(5, "sweep curve fees: protocol / buyback / creator");
row("feeSweepOperator", await hook.feeSweepOperator());
row("pending fee bucket", fmt(await curve.quoteFeeBalance()));
row("pending creator tax", fmt(await curve.creatorTaxBalance()));
row("buyback earmark", fmt(await curve.buybackQuoteBalance()));
const pendingFeeBucket = await curve.quoteFeeBalance();
const sweepReceipt = await (await curve.connect(deployer).sweepFees(1n)).wait();
const swept = firstEvent(sweepReceipt, curve.interface, "FeesSwept")!;
const lockedEv = firstEvent(sweepReceipt, curve.interface, "BuybackLocked");
console.log();
row("-> protocol", `${fmt(swept.args.protocolAmount)}  = ${pct(swept.args.protocolAmount, pendingFeeBucket)} of the fee bucket`);
row("-> buyback", fmt(swept.args.buybackAmount));
row("-> creator", `${fmt(swept.args.creatorAmount)}  (base share + creator tax in full)`);
if (lockedEv) {
  row("buyback bought + locked", `${fmt(lockedEv.args.tokensLocked)} LIFE for ${fmt(lockedEv.args.quoteSpent)} native`);
} else {
  row("buyback", "folded back into the creator payout (curve too thin or price impact too large)");
}
console.log();
row("escrow: protocol recipient", fmt(await escrow.balanceOf(feeRecipient.address)));
row("escrow: creator recipient", fmt(await escrow.balanceOf(creator.address)));
row("vault: totalLocked", `${fmt(await vault.totalLocked(tokenAddress))} LIFE`);

step(6, "buy through to auto-graduation");
console.log("   readyToGraduate() is sellableTokens() == 0, not a quote threshold.");
console.log("   The crossing buy calls factory.graduate() itself, from _tryAutoGraduate.");
console.log();
let guard = 0;
while (!(await curve.graduated()) && guard++ < 30) {
  const chunk = ethers.parseEther("1");
  await (await curve.connect(trader).buy(chunk, 0n, trader.address, { value: chunk })).wait();
  const real = fmt(await curve.realQuoteReserve());
  const sellable = fmt(await curve.sellableTokens());
  row("  after +1 native", `realQuote ${real.padEnd(22)} sellable ${sellable.padEnd(24)} graduated ${await curve.graduated()}`);
}
if (!(await curve.graduated())) throw new Error("curve never graduated");

step(7, "graduation reconciled");
let launched = await factory.getLaunchedToken(tokenAddress);
if (launched.phase === 0n) await (await factory.graduate(tokenAddress)).wait();
launched = await factory.getLaunchedToken(tokenAddress);
row("phase", `${launched.phase}  (1 = Swept)`);
row("swept quote", `${fmt(launched.sweptQuote)} native`);
row("graduationThreshold", `${fmt(LAUNCH_CONFIG_0.graduationThreshold)} native`);
row("  at or above threshold?", launched.sweptQuote >= LAUNCH_CONFIG_0.graduationThreshold ? "yes" : "NO");
row("swept tokens", `${fmt(launched.sweptTokens)} LIFE`);

const poolReceipt = await (await factory.createGraduatedPool(tokenAddress)).wait();
const gradEv = firstEvent(poolReceipt, factory.interface, "PoolGraduated")!;
launched = await factory.getLaunchedToken(tokenAddress);
console.log();
row("phase", `${launched.phase}  (2 = PoolCreated)`);
row("V4 position id", gradEv.args.positionId);
row("seeded into pool", `${fmt(gradEv.args[2])} LIFE + ${fmt(gradEv.args[3])} native`);
row("position locked", await locker.isLocked(tokenAddress));
row("excess supply locked", `${fmt(await locker.lockedTokenSupply(tokenAddress))} LIFE`);
row("left on the curve", `${fmt(await ethers.provider.getBalance(curveAddress))} native (stranded donations only)`);

step(8, "claim from the escrow");
const claimants: Array<[string, (typeof feeRecipient)]> = [
  ["protocol", feeRecipient],
  ["creator", creator],
];
for (const [who, signer] of claimants) {
  const owed = await escrow.balanceOf(signer.address);
  row(`${who} owed`, fmt(owed));
  if (owed > 0n) {
    const before = await ethers.provider.getBalance(signer.address);
    await (await escrow.connect(signer)["claim()"]()).wait();
    const after = await ethers.provider.getBalance(signer.address);
    row(`${who} claimed`, `~${fmt(after - before)} native net of gas, remaining ${fmt(await escrow.balanceOf(signer.address))}`);
  }
}

console.log("\nscenario 1 complete: launch, fee split, sweep, graduation and claim all reconciled");
