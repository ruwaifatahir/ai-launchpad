// Full lifecycle on Robinhood Chain testnet, priced in a mintable mock stock token.
//
//   pnpm hardhat run scripts/testnet/stockLifecycle.ts --network ponsTestnet
//
// Uses the newest deployments/ponsTestnet-*.json (override with DEPLOYMENT=path).
// Reuses an existing mock with MOCK_TOKEN=0x..., otherwise deploys a new one.
// The real stock tokens do not exist on testnet, and the native preset (#0) is
// left untouched: an ERC-20 quote supplies its own phantom reserve and threshold.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { network } from "hardhat";
import { LAUNCH_CONFIG_0, QUOTE_ASSETS } from "../../config/pons.js";
import { firstEvent, row, step } from "../../lib/forkHarness.js";
import { launch } from "../../lib/launch.js";

const { ethers, networkName } = await network.getOrCreate();
const [signer] = await ethers.getSigners();
const me = await signer.getAddress();

const file =
  process.env.DEPLOYMENT ??
  `deployments/${readdirSync("deployments").filter((f) => f.startsWith(`${networkName}-`)).sort().at(-1)}`;
const d = JSON.parse(readFileSync(file, "utf8"));
const NVDA = QUOTE_ASSETS.NVDA; // mainnet economics, 18 decimals
const q = (v: bigint | number) => `${ethers.formatUnits(v, 18)} NVDA`;
// ERC-20 auto-graduation needs headroom over the estimate (see scenario 3).
const BUY_GAS = { gasLimit: 6_000_000 };

row("deployment", file);
row("signer", me);
row("native balance", `${ethers.formatEther(await ethers.provider.getBalance(me))} ETH`);

const factory = await ethers.getContractAt("PonsV2LaunchFactory", d.factory, signer);
const escrow = await ethers.getContractAt("PonsV2FeeEscrow", d.feeEscrow, signer);
const locker = await ethers.getContractAt("PonsV2LaunchLocker", d.locker, signer);

step(1, "mock stock token");
let mock: any;
if (process.env.MOCK_TOKEN) {
  mock = await ethers.getContractAt("MockStockToken", process.env.MOCK_TOKEN, signer);
} else {
  mock = await (await ethers.getContractFactory("MockStockToken", signer)).deploy(
    "NVIDIA • Robinhood Token (Test)",
    "NVDA",
  );
  await mock.waitForDeployment();
}
const mockAddr = await mock.getAddress();
row("mock NVDA", mockAddr);

step(2, "register it as a quote asset (economics first, then approval)");
if (!(await factory.approvedPairTokens(mockAddr))) {
  await (await factory.setPairTokenEconomics(mockAddr, NVDA.phantomQuote, NVDA.graduationThreshold, 18)).wait();
  await (await factory.setPairTokenApproved(mockAddr, true)).wait();
}
row("approved", await factory.approvedPairTokens(mockAddr));
row("phantomQuote", q(NVDA.phantomQuote));
row("graduationThreshold", q(NVDA.graduationThreshold));

step(3, "mint");
const grant = 1_000n * 10n ** 18n;
await (await mock.mint(me, grant)).wait();
row("balance", q(await mock.balanceOf(me)));

step(4, "launch a memecoin priced in NVDA (preset #0)");
const { tokenAddress, curveAddress, token, curve } = await launch(ethers, factory, signer, {
  name: "Testnet Meme",
  symbol: "TMEME",
  pairToken: mockAddr,
  creatorFeeRecipient: me,
  creatorTaxBps: 100,
  buybackEnabled: true,
});
row("token", tokenAddress);
row("curve", curveAddress);
row("pairToken", await curve.pairToken());
await (await mock.approve(curveAddress, ethers.MaxUint256)).wait();

step(5, "buy, sell, then buy through to graduation");
const b = await (await curve.buy(5n * 10n ** 18n, 0n, me, BUY_GAS)).wait();
const buyEv = firstEvent(b, curve.interface, "CurveBuy")!;
row("buy 5 NVDA -> tokens", ethers.formatUnits(buyEv.args.tokensOut, 18));
const sellAmount = (await token.balanceOf(me)) / 4n;
await (await token.approve(curveAddress, sellAmount)).wait();
const s = await (await curve.sell(sellAmount, 0n, me)).wait();
row("sell 1/4 -> NVDA", q(firstEvent(s, curve.interface, "CurveSell")!.args.quoteOut));

const chunk = 10n * 10n ** 18n;
let guard = 0;
while (!(await curve.graduated()) && !(await curve.readyToGraduate()) && guard++ < 20) {
  await (await curve.buy(chunk, 0n, me, BUY_GAS)).wait();
  row("  +10 NVDA", `realQuote ${q(await curve.realQuoteReserve())}`);
}
row("graduated on the crossing buy", await curve.graduated());

step(6, "graduate + seed the Uniswap V4 pool");
let launched = await factory.getLaunchedToken(tokenAddress);
if (launched.phase === 0n) await (await factory.graduate(tokenAddress)).wait();
launched = await factory.getLaunchedToken(tokenAddress);
row("swept quote", q(launched.sweptQuote));
const poolReceipt = await (await factory.createGraduatedPool(tokenAddress)).wait();
const gradEv = firstEvent(poolReceipt, factory.interface, "PoolGraduated")!;
row("V4 position id", gradEv.args[1]);
row("position locked", await locker.isLocked(tokenAddress));
row("tickSpacing", LAUNCH_CONFIG_0.tickSpacing);

step(7, "fees in escrow, then claim");
const owed = await escrow.balanceOfToken(me, mockAddr);
row("escrow NVDA owed (protocol + creator)", q(owed));
row("escrow native owed", `${ethers.formatEther(await escrow.balanceOf(me))} ETH`);
if (owed > 0n) {
  const before = await mock.balanceOf(me);
  await (await escrow["claimToken(address)"](mockAddr)).wait();
  row("claimed", q((await mock.balanceOf(me)) - before));
}

const out = { ...d, mockStockTokens: { ...(d.mockStockTokens ?? {}), NVDA: mockAddr }, lastTestLaunch: { token: tokenAddress, curve: curveAddress } };
writeFileSync(file, JSON.stringify(out, null, 2));
row("saved", file);
console.log("\n✔ testnet lifecycle complete: mock stock quote, launch, trade, graduation, V4 pool, fee claim");
