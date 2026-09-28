// Scenario 3 — a launch priced in an ERC-20 quote asset instead of native.
//
//   pnpm hardhat run scripts/scenarios/03-erc20Quote.ts --network ponsFork
//
// Every live Pons launch we sampled used one of these (USDG, NVDA, MSTR, SPY,
// IBM, SLV). USDG is the interesting one: 6 decimals, so it exercises the
// decimal-scaling path and the re-check the factory performs at launch time.
// Funding comes from impersonating a real USDG holder on the fork.
import { network } from "hardhat";
import { LAUNCH_CONFIG_0, QUOTE_ASSETS } from "../../config/pons.js";
import { deployPons } from "../../lib/deployPons.js";
import { computePoolId, expectRevert, firstEvent, impersonate, poolKeyFor, row, step, warp } from "../../lib/forkHarness.js";
import { launch } from "../../lib/launch.js";

const { ethers } = await network.getOrCreate();
const USDG = QUOTE_ASSETS.USDG;
const q = (v: bigint | number) => `${ethers.formatUnits(v, USDG.decimals)} USDG`;
const t = (v: bigint) => `${ethers.formatUnits(v, 18)} SIX`;

const [deployer, trader, feeRecipient, creator] = await ethers.getSigners();

step(0, "deploy a fresh instance");
const d = await deployPons(ethers, deployer, {
  owner: deployer.address,
  protocolFeeRecipient: feeRecipient.address,
  configure: true,
  log: () => {},
});
const factory = await ethers.getContractAt("PonsV2LaunchFactory", d.factory, deployer);
const escrow = await ethers.getContractAt("PonsV2FeeEscrow", d.feeEscrow, deployer);
const locker = await ethers.getContractAt("PonsV2LaunchLocker", d.locker, deployer);
const usdg: any = new ethers.Contract(
  USDG.address,
  [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)",
    "function approve(address,uint256) returns (bool)",
  ],
  ethers.provider,
);
row("USDG", USDG.address);
row("decimals (live)", await usdg.decimals());

step(1, "a quote asset must be approved first");
console.log("   Native (address(0)) is accepted without approval. Everything else");
console.log("   has to be approved AND given its own economics, denominated in its");
console.log("   own decimals — not wei.");
console.log();
row("approvedPairTokens(USDG)", await factory.approvedPairTokens(USDG.address));
await expectRevert(
  launch(ethers, factory, deployer, { pairToken: USDG.address, symbol: "SIX", expectedEconomics: ethers.ZeroHash }),
  "PairTokenNotApproved",
  "launch against an unapproved quote",
);
// Approval reads the stored economics and re-checks the asset's decimals, so
// the economics have to be in place first — the order is not interchangeable.
await expectRevert(
  factory.setPairTokenApproved(USDG.address, true),
  "PairTokenEconomicsInvalid",
  "approve before setting economics",
);

await (await factory.setPairTokenEconomics(
  USDG.address,
  USDG.phantomQuote,
  USDG.graduationThreshold,
  USDG.decimals,
)).wait();
await (await factory.setPairTokenApproved(USDG.address, true)).wait();
console.log();
row("approvedPairTokens(USDG)", await factory.approvedPairTokens(USDG.address));
const econ = await factory.pairTokenEconomics(USDG.address);
row("phantomQuote", q(econ[0]));
row("graduationThreshold", q(econ[1]));
row("expected decimals", econ[2]);
console.log();
console.log("   These mirror the live factory exactly. Note the config's own");
console.log(`   phantomQuote (${ethers.formatUnits(LAUNCH_CONFIG_0.phantomQuote, 18)}) and threshold are ignored for an`);
console.log("   ERC-20 quote — the pair token supplies its own.");

step(2, "fund the traders by impersonating a real USDG holder");
const whaleAddress = USDG.whales[0];
const whale = await impersonate(ethers, whaleAddress);
row("whale", whaleAddress);
row("whale balance", q(await usdg.balanceOf(whaleAddress)));
const grant = 50_000n * 10n ** BigInt(USDG.decimals);
for (const who of [trader.address, deployer.address]) {
  await (await usdg.connect(whale).transfer(who, grant)).wait();
}
row("trader funded", q(await usdg.balanceOf(trader.address)));
row("launcher funded", q(await usdg.balanceOf(deployer.address)));

step(3, "launch against USDG");
const { tokenAddress, curveAddress, token, curve } = await launch(ethers, factory, deployer, {
  name: "SixDecimals",
  symbol: "SIX",
  pairToken: USDG.address,
  creatorFeeRecipient: creator.address,
  creatorTaxBps: 100,
  buybackEnabled: true,
});
row("token", tokenAddress);
row("curve", curveAddress);
row("pairToken", await curve.pairToken());
row("isNativeQuote", await curve.isNativeQuote());
row("phantomQuote", q(await curve.phantomQuote()));
row("graduationThreshold", q(await curve.graduationThreshold()));
row("launch fee", "still paid in native — only the curve is quote-denominated");

// Step past the snipe window so the numbers below are steady-state.
await warp(ethers, Number(await factory.snipeTaxSeconds()) + 1);

step(4, "buy with USDG (no msg.value)");
const buyIn = 1_000n * 10n ** BigInt(USDG.decimals);
await (await usdg.connect(trader).approve(curveAddress, buyIn)).wait();
const buyReceipt = await (await curve.connect(trader).buy(buyIn, 0n, trader.address)).wait();
const buyEv = firstEvent(buyReceipt, curve.interface, "CurveBuy")!;
row("spent", q(buyEv.args.quoteIn));
row("curve fee", q(buyEv.args.fee));
row("creator tax", q(buyEv.args.tax));
row("tokens out", t(buyEv.args.tokensOut));
const [qr, tr] = await curve.getReserves();
row("reserves", `${q(qr)} / ${t(tr)}`);
console.log("   The 6-decimal quote and the 18-decimal token sit on the same curve;");
console.log("   PonsV2BondingCurveMath works in raw units, so no scaling is implied.");

await expectRevert(
  curve.connect(trader).buy(buyIn, 0n, trader.address, { value: 1n }),
  "UnexpectedNativeValue",
  "sending native alongside an ERC-20 buy",
);

step(5, "sell back");
const held = await token.balanceOf(trader.address);
const sellAmount = held / 4n;
await (await token.connect(trader).approve(curveAddress, sellAmount)).wait();
const sellReceipt = await (await curve.connect(trader).sell(sellAmount, 0n, trader.address)).wait();
const sellEv = firstEvent(sellReceipt, curve.interface, "CurveSell")!;
row("tokens in", t(sellEv.args.tokensIn));
row("USDG out (net)", q(sellEv.args.quoteOut));
row("curve fee", q(sellEv.args.fee));
row("creator tax", q(sellEv.args.tax));

step(6, "buy through to graduation");
// Set BUY_GAS_LIMIT to override the estimate — see the note below.
const gasOverride = process.env.BUY_GAS_LIMIT ? { gasLimit: Number(process.env.BUY_GAS_LIMIT) } : {};
const chunk = 2_000n * 10n ** BigInt(USDG.decimals);
let guard = 0;
let lastBuy: any = null;
while (!(await curve.graduated()) && !(await curve.readyToGraduate()) && guard++ < 30) {
  await (await usdg.connect(trader).approve(curveAddress, chunk)).wait();
  lastBuy = await (await curve.connect(trader).buy(chunk, 0n, trader.address, gasOverride)).wait();
  row(`  after +${ethers.formatUnits(chunk, USDG.decimals)} USDG`, `realQuote ${q(await curve.realQuoteReserve())}   sellable ${t(await curve.sellableTokens())}`);
}
console.log();
row("readyToGraduate", await curve.readyToGraduate());
row("graduated", await curve.graduated());
const autoFailed = lastBuy ? firstEvent(lastBuy, curve.interface, "AutoGraduationFailed") : null;
if (autoFailed) {
  row("AutoGraduationFailed", `gas remaining ${autoFailed.args.gasRemaining}`);
  console.log();
  console.log("   Worth knowing: on the native path the crossing buy auto-graduates. On an");
  console.log("   ERC-20 quote it does not, under a default gas estimate. Graduating costs");
  console.log("   more gas here, the estimate is computed on the path where the nested call");
  console.log("   already failed, and EIP-150 only forwards 63/64 of what is left — so the");
  console.log("   inner factory.graduate runs out and _tryAutoGraduate swallows it.");
  console.log("   Re-run with BUY_GAS_LIMIT=6000000 and it auto-graduates instead.");
  console.log();
  console.log("   Nothing is stuck either way: trading is already closed and graduate() is");
  console.log("   permissionless, so anyone can settle the launch. That is what step 7 does.");
}

step(7, "seed the V4 pool — note the currency ordering");
let launched = await factory.getLaunchedToken(tokenAddress);
if (launched.phase === 0n) await (await factory.graduate(tokenAddress)).wait();
launched = await factory.getLaunchedToken(tokenAddress);
row("swept quote", q(launched.sweptQuote));
row("graduationThreshold", q(USDG.graduationThreshold));
row("swept tokens", t(launched.sweptTokens));

const poolReceipt = await (await factory.createGraduatedPool(tokenAddress)).wait();
const gradEv = firstEvent(poolReceipt, factory.interface, "PoolGraduated")!;
const { key, memecoinIsCurrency0 } = poolKeyFor(
  tokenAddress,
  USDG.address,
  LAUNCH_CONFIG_0.poolFee,
  LAUNCH_CONFIG_0.tickSpacing,
  d.memeHook,
);
console.log();
row("position id", gradEv.args[1]);
row("currency0", key.currency0);
row("currency1", key.currency1);
row("memecoin is currency0?", `${memecoinIsCurrency0}  (decided by address order, unlike native)`);
row("poolId", computePoolId(key));
row("position locked", await locker.isLocked(tokenAddress));
row("excess supply locked", t(await locker.lockedTokenSupply(tokenAddress)));

step(8, "fees arrive as token credits, not native");
row("escrow native: protocol", ethers.formatUnits(await escrow.balanceOf(feeRecipient.address), 18));
row("escrow USDG: protocol", q(await escrow.balanceOfToken(feeRecipient.address, USDG.address)));
row("escrow USDG: creator", q(await escrow.balanceOfToken(creator.address, USDG.address)));
console.log();
const before = await usdg.balanceOf(creator.address);
await (await escrow.connect(creator)["claimToken(address)"](USDG.address)).wait();
row("creator claimed", q((await usdg.balanceOf(creator.address)) - before));
row("remaining", q(await escrow.balanceOfToken(creator.address, USDG.address)));

step(9, "the decimals guard");
console.log("   The stored scale is checked three times: when economics are set,");
console.log("   when the asset is approved, and again on every launch. A silent");
console.log("   twelve-order-of-magnitude mispricing is the thing being prevented.");
console.log();
await expectRevert(
  factory.setPairTokenEconomics(USDG.address, USDG.phantomQuote, USDG.graduationThreshold, 18),
  "PairTokenDecimalsMismatch",
  "declare USDG as 18 decimals",
);
await expectRevert(
  factory.setPairTokenEconomics(USDG.address, USDG.phantomQuote, USDG.graduationThreshold, 2),
  "PairTokenEconomicsInvalid",
  "declare a quote coarser than 6 decimals",
);
row("stored decimals", (await factory.pairTokenEconomics(USDG.address))[2]);

console.log("\nscenario 3 complete: a full 6-decimal ERC-20 quote lifecycle");
