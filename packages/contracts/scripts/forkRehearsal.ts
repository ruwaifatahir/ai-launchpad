// End-to-end deployment rehearsal against a fork of Robinhood Chain mainnet.
// This is a rehearsal, not a test suite: it deploys a fresh Pons V2 instance
// against the REAL Uniswap V4 PoolManager/PositionManager/Permit2 and walks one
// launch all the way through launch -> buy -> sell -> graduate -> claim fees.
//
//   pnpm hardhat run scripts/forkRehearsal.ts --network ponsFork
//
// Requires FORK_RPC_URL to point at an archive endpoint; the public Robinhood
// RPC retains only ~9 minutes of state and will fail on any pinned block.
import { network } from "hardhat";
import { LAUNCH_CONFIG_0, NATIVE } from "../config/pons.js";
import { deployPons } from "../lib/deployPons.js";

const { ethers } = await network.getOrCreate();

const fmt = (v: bigint, d = 18) => ethers.formatUnits(v, d);
const step = (n: number, msg: string) => console.log(`\n── ${n}. ${msg} ${"─".repeat(Math.max(0, 50 - msg.length))}`);

const [deployer, trader, feeRecipient] = await ethers.getSigners();
const blockNumber = await ethers.provider.getBlockNumber();
const chainId = (await ethers.provider.getNetwork()).chainId;
console.log(`forked chainId ${chainId} at block ${blockNumber}`);
console.log(`deployer ${deployer.address}`);
console.log(`trader   ${trader.address}`);

step(1, "deploy + wire a fresh Pons V2 instance");
const d = await deployPons(ethers, deployer, {
  owner: deployer.address,
  protocolFeeRecipient: feeRecipient.address,
  configure: true,
  log: (m) => console.log(`   ${m}`),
});

const factory = await ethers.getContractAt("PonsV2LaunchFactory", d.factory, deployer);
const escrow = await ethers.getContractAt("PonsV2FeeEscrow", d.feeEscrow, feeRecipient);

step(2, "launch a token on the native-quote curve");
const economics = await factory.previewLaunchEconomics(0n, NATIVE);
const params = {
  name: "Rehearsal",
  symbol: "REH",
  logo: "",
  description: "fork rehearsal",
  socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
  creatorFeeRecipient: deployer.address,
  creatorTaxBps: 100,
  buybackEnabled: true,
  expectedEconomics: economics,
  salt: ethers.hexlify(ethers.randomBytes(32)),
};
const launchFee = await factory.launchFee();
const launched = await factory["launchToken((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address)"](
  params,
  0n,
  NATIVE,
  { value: launchFee },
);
const receipt = await launched.wait();
const launchLog = receipt!.logs
  .map((l: any) => { try { return factory.interface.parseLog(l); } catch { return null; } })
  .find((p: any) => p?.name === "TokenLaunched");
const tokenAddr: string = launchLog!.args.token;
const curveAddr: string = launchLog!.args.curve;
console.log(`   token ${tokenAddr}`);
console.log(`   curve ${curveAddr}`);

const curve = await ethers.getContractAt("PonsV2BondingCurve", curveAddr, trader);
const token = await ethers.getContractAt("PonsV2LauncherToken", tokenAddr, trader);

// The snipe tax starts at 99% and decays over snipeTaxSeconds. Step past it so
// the rehearsal measures the steady-state fee split, not the anti-sniper ramp.
const snipeSeconds = await factory.snipeTaxSeconds();
await ethers.provider.send("evm_increaseTime", [Number(snipeSeconds) + 2]);
await ethers.provider.send("evm_mine", []);

step(3, "buy on the bonding curve");
const buy1 = ethers.parseEther("0.5");
await (await curve.buy(buy1, 0n, trader.address, { value: buy1 })).wait();
const bought = await token.balanceOf(trader.address);
console.log(`   spent ${fmt(buy1)} native -> ${fmt(bought)} REH`);
let [qr, tr] = await curve.getReserves();
console.log(`   reserves: quote ${fmt(qr)} / tokens ${fmt(tr)}`);

step(4, "sell part of the position back");
const sellAmount = bought / 4n;
await (await token.approve(curveAddr, sellAmount)).wait();
const balBefore = await ethers.provider.getBalance(trader.address);
await (await curve.sell(sellAmount, 0n, trader.address)).wait();
const balAfter = await ethers.provider.getBalance(trader.address);
console.log(`   sold ${fmt(sellAmount)} REH -> ~${fmt(balAfter - balBefore)} native (net of gas)`);

step(5, "buy until the curve auto-graduates");
// Graduation is not driven by a quote threshold from the outside: the curve is
// ready once its sellable allocation is exhausted (sellableTokens() == 0), and
// the crossing buy calls factory.graduate() itself via _tryAutoGraduate().
console.log(`   graduationThreshold ${fmt(LAUNCH_CONFIG_0.graduationThreshold)} native`);
let guard = 0;
while (!(await curve.graduated()) && guard++ < 25) {
  const chunk = ethers.parseEther("1");
  await (await curve.buy(chunk, 0n, trader.address, { value: chunk })).wait();
  console.log(
    `   realQuoteReserve ${fmt(await curve.realQuoteReserve())} | sellable ${fmt(await curve.sellableTokens())} | graduated ${await curve.graduated()}`,
  );
}
if (!(await curve.graduated())) throw new Error("curve never graduated");

step(6, "settle graduation and seed the locked V4 pool");
let launch = await factory.getLaunchedToken(tokenAddr);
if (launch.phase === 0n) {
  // _tryAutoGraduate swallows failures, so fall back to the permissionless call.
  await (await factory.graduate(tokenAddr)).wait();
  launch = await factory.getLaunchedToken(tokenAddr);
}
console.log(`   phase after sweep               : ${launch.phase} (1 = Swept)`);
console.log(`   swept ${fmt(launch.sweptQuote)} native + ${fmt(launch.sweptTokens)} REH`);

const poolTx = await (await factory.createGraduatedPool(tokenAddr)).wait();
const gradLog = poolTx!.logs
  .map((l: any) => { try { return factory.interface.parseLog(l); } catch { return null; } })
  .find((p: any) => p?.name === "PoolGraduated");
launch = await factory.getLaunchedToken(tokenAddr);
console.log(`   phase after createGraduatedPool : ${launch.phase} (2 = PoolCreated)`);
console.log(`   V4 position id                  : ${gradLog!.args.positionId}`);

const locker = await ethers.getContractAt("PonsV2LaunchLocker", d.locker, deployer);
console.log(`   position locked                 : ${await locker.isLocked(tokenAddr)}`);
console.log(`   locked position id              : ${await locker.lockedPositions(tokenAddr)}`);
console.log(`   locked token supply             : ${fmt(await locker.lockedTokenSupply(tokenAddr))} REH`);

step(7, "claim accrued fees from the escrow");
const protocolOwed = await escrow.balanceOf(feeRecipient.address);
const creatorOwed = await escrow.balanceOf(deployer.address);
console.log(`   protocol recipient owed : ${fmt(protocolOwed)} native`);
console.log(`   creator  recipient owed : ${fmt(creatorOwed)} native`);
if (protocolOwed > 0n) {
  const before = await ethers.provider.getBalance(feeRecipient.address);
  await (await escrow["claim()"]()).wait();
  const after = await ethers.provider.getBalance(feeRecipient.address);
  console.log(`   claimed ~${fmt(after - before)} native (net of gas)`);
  console.log(`   remaining balance: ${fmt(await escrow.balanceOf(feeRecipient.address))}`);
} else {
  console.log(`   nothing to claim (all curve fees were swept into the pool seed)`);
}

console.log(`\n✔ rehearsal complete — launch, trade, graduation and fee claim all executed`);
