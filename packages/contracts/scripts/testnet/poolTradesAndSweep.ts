// Trade in a graduated test launch's pool through Uniswap's UniversalRouter, then sweep its
// fees, so the indexer has real pool trades, a buyback and a fee conversion on testnet.
//
//   pnpm hardhat run scripts/testnet/poolTradesAndSweep.ts --network ponsTestnet
//
// Uses the newest deployments/ponsTestnet-*.json (override with DEPLOYMENT=path) and its
// lastTestLaunch (override with TOKEN=0x...). The signer must hold the quote asset and be
// the hook's fee sweep operator. BUY_QUOTE (default 2) is the quote spent on the buy;
// SELL_SHARE_BPS (default 2000) is the share of the signer's launch tokens sold. SWEEP_ONLY=1
// skips the trades and only sweeps.
import { readdirSync, readFileSync } from "node:fs";
import { network } from "hardhat";
import { EXTERNAL, LAUNCH_CONFIG_0, NATIVE, V4_PERIPHERY } from "../../config/pons.js";
import { computePoolId, eventsFrom, firstEvent, poolKeyFor, row, step } from "../../lib/forkHarness.js";

const { ethers, networkName } = await network.getOrCreate();
const [signer] = await ethers.getSigners();
const me = await signer.getAddress();

const file =
  process.env.DEPLOYMENT ??
  `deployments/${readdirSync("deployments").filter((f) => f.startsWith(`${networkName}-`)).sort().at(-1)}`;
const d = JSON.parse(readFileSync(file, "utf8"));
const tokenAddress: string = process.env.TOKEN ?? d.lastTestLaunch.token;

// The UniversalRouter Pons mainnet trades go through; it is deployed on testnet too.
const ROUTER = V4_PERIPHERY.universalRouters[1];
const V4_SWAP = "0x10";
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

row("deployment", file);
row("signer", me);
row("native balance", `${ethers.formatEther(await ethers.provider.getBalance(me))} ETH`);

const factory = await ethers.getContractAt("PonsV2LaunchFactory", d.factory, signer);
const hook = await ethers.getContractAt("PonsV2MemeHook", d.memeHook, signer);
const token = await ethers.getContractAt("PonsV2LauncherToken", tokenAddress, signer);
const erc20 = [
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
];

step(1, "the launch and its pool");
const launched = await factory.getLaunchedToken(tokenAddress);
const quoteAddress: string = launched.pairToken;
if (quoteAddress === NATIVE) throw new Error("this script trades ERC-20-quoted launches only");
const quote = new ethers.Contract(quoteAddress, erc20, signer);
const symbol = await token.symbol();
const quoteSymbol = await quote.symbol();
row("token", `${tokenAddress} (${symbol})`);
row("quote asset", `${quoteAddress} (${quoteSymbol})`);
row("phase", `${launched.phase}  (2 = pool created)`);
if (launched.phase !== 2n) throw new Error("the launch has no pool yet: graduate it first");

const { key, memecoinIsCurrency0 } = poolKeyFor(
  tokenAddress,
  quoteAddress,
  LAUNCH_CONFIG_0.poolFee,
  LAUNCH_CONFIG_0.tickSpacing,
  d.memeHook,
);
const poolId = computePoolId(key);
const info = await hook.launches(poolId);
row("pool id", poolId);
row("registered with the hook", info.registered);
row("hook fee / creator tax", `${info.hookFeeBps} / ${info.creatorTaxBps} bps`);
if (!info.registered) throw new Error("pool key does not match a registered pool");
const operator = await hook.feeSweepOperator();
row("fee sweep operator", operator);
if (operator.toLowerCase() !== me.toLowerCase()) throw new Error("the signer is not the fee sweep operator");

// PoolKey, zeroForOne, amountIn, amountOutMinimum, then two dynamic fields, both empty. This
// is the layout the router decodes on Robinhood Chain, read off a real Pons mainnet swap.
const coder = ethers.AbiCoder.defaultAbiCoder();
function swapInput(zeroForOne: boolean, amountIn: bigint, inCurrency: string, outCurrency: string): string {
  const actions = ethers.solidityPacked(["uint8", "uint8", "uint8"], [SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]);
  const swap = coder.encode(
    ["tuple(tuple(address,address,uint24,int24,address),bool,uint128,uint128,bytes,bytes)"],
    [[[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks], zeroForOne, amountIn, 0n, "0x", "0x"]],
  );
  const settle = coder.encode(["address", "uint256"], [inCurrency, amountIn]);
  const take = coder.encode(["address", "uint256"], [outCurrency, 0n]);
  return coder.encode(["bytes", "bytes[]"], [actions, [swap, settle, take]]);
}

const router = new ethers.Contract(
  ROUTER,
  ["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"],
  signer,
);
const permit2 = new ethers.Contract(
  EXTERNAL.permit2,
  [
    "function approve(address token, address spender, uint160 amount, uint48 expiration)",
    "function allowance(address owner, address token, address spender) view returns (uint160, uint48, uint48)",
  ],
  signer,
);

async function allowRouter(asset: any, label: string) {
  const address = await asset.getAddress();
  if ((await asset.allowance(me, EXTERNAL.permit2)) < 2n ** 200n) {
    await (await asset.approve(EXTERNAL.permit2, ethers.MaxUint256)).wait();
  }
  const [amount, expiration] = await permit2.allowance(me, address, ROUTER);
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (amount < 2n ** 150n || expiration < now + 3600n) {
    await (await permit2.approve(address, ROUTER, 2n ** 160n - 1n, now + 30n * 86400n)).wait();
  }
  row(`${label} allowed through Permit2`, "yes");
}

async function swap(zeroForOne: boolean, amountIn: bigint, inCurrency: string, outCurrency: string) {
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;
  const args = [V4_SWAP, [swapInput(zeroForOne, amountIn, inCurrency, outCurrency)], deadline] as const;
  // Simulate first: a wrong encoding reverts here and costs nothing.
  const gas = await router.execute.estimateGas(...args);
  const receipt = await (await router.execute(...args, { gasLimit: (gas * 3n) / 2n })).wait();
  row("transaction", receipt.hash);
  row("block", receipt.blockNumber);
  for (const ev of eventsFrom(receipt, hook.interface, "HookFeeCollected")) {
    const currency = ev.args.currency.toLowerCase() === tokenAddress.toLowerCase() ? symbol : quoteSymbol;
    row("HookFeeCollected", `${currency}  fee ${ethers.formatUnits(ev.args.feeAmount, 18)}  tax ${ethers.formatUnits(ev.args.taxAmount, 18)}`);
  }
  return receipt;
}

async function balances(label: string) {
  row(label, `${ethers.formatUnits(await token.balanceOf(me), 18)} ${symbol}, ${ethers.formatUnits(await quote.balanceOf(me), 18)} ${quoteSymbol}`);
}

if (process.env.SWEEP_ONLY !== "1") {
step(2, "allow the router to pull both assets");
await allowRouter(quote, quoteSymbol);
await allowRouter(new ethers.Contract(tokenAddress, erc20, signer), symbol);

step(3, `buy ${symbol} with ${quoteSymbol} through the UniversalRouter`);
await balances("before");
const buyQuote = ethers.parseUnits(process.env.BUY_QUOTE ?? "2", 18);
// Buying the launch token pays the quote asset in.
await swap(!memecoinIsCurrency0, buyQuote, quoteAddress, tokenAddress);
await balances("after");

step(4, `sell ${symbol} for ${quoteSymbol} through the UniversalRouter`);
const sellTokens = ((await token.balanceOf(me)) * BigInt(process.env.SELL_SHARE_BPS ?? "2000")) / 10_000n;
await swap(memecoinIsCurrency0, sellTokens, tokenAddress, quoteAddress);
await balances("after");
}

step(5, "sweep the pool's fees as the operator");
row("pending fees in the launch token", ethers.formatUnits(await hook.pendingFees(poolId, tokenAddress), 18));
row("pending fees in the quote asset", ethers.formatUnits(await hook.pendingFees(poolId, quoteAddress), 18));
// The hook refuses a zero minimum for a swap it makes. 1 accepts any fill: a test pool's
// price is ours to move, so there is nothing to protect.
await hook.sweepPoolFees.staticCall(poolId, 1n, 1n);
const sweep = await (await hook.sweepPoolFees(poolId, 1n, 1n, { gasLimit: 3_000_000 })).wait();
row("transaction", sweep!.hash);
row("block", sweep!.blockNumber);
const swept = firstEvent(sweep, hook.interface, "PoolFeesSwept");
if (swept) {
  row("PoolFeesSwept", "");
  row("  -> protocol", ethers.formatUnits(swept.args.protocolAmount, 18));
  row("  -> buyback", ethers.formatUnits(swept.args.buybackAmount, 18));
  row("  -> creator", ethers.formatUnits(swept.args.creatorAmount, 18));
  row("  -> tokens locked", ethers.formatUnits(swept.args.tokensLocked, 18));
}
if (firstEvent(sweep, hook.interface, "PoolConversionSkipped")) row("PoolConversionSkipped", "yes");
if (firstEvent(sweep, hook.interface, "PoolBuybackSkipped")) row("PoolBuybackSkipped", "yes");

console.log("\n✔ pool buy, pool sell and fee sweep done on testnet");
