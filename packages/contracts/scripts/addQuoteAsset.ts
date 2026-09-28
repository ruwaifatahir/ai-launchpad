// Approves an ERC-20 as a quote asset on an existing deployment, so launches
// can pair against it instead of the native asset. Native needs no approval;
// the factory always accepts address(0).
//
//   QUOTE_TOKEN=0x... QUOTE_PER_NATIVE=2500 pnpm quote:add
//   QUOTE_TOKEN=0x... QUOTE_PHANTOM=3236 QUOTE_GRADUATION_THRESHOLD=8090 pnpm quote:add
//
// Runs on the target network (append --network <name> to `pnpm hardhat run`
// for another) against the newest deployments/<network>-*.json, or DEPLOYMENT.
// The signer must own the factory.
//
// The factory calls, both owner-only:
//   setPairTokenEconomics(address pairToken, uint256 phantomQuote,
//                         uint256 graduationThreshold, uint8 expectedDecimals)
//   setPairTokenApproved(address pairToken, bool approved)
//
// Inputs, all read from the environment:
//   QUOTE_TOKEN                 The ERC-20 address. Must already hold code.
//   QUOTE_PER_NATIVE            How many whole quote tokens one whole native
//                               unit is worth, e.g. 2500 for a USD stablecoin
//                               when the native asset trades at $2,500. Both
//                               figures below are then derived from launch
//                               config #0 at that rate, so the curve trades
//                               exactly like a native launch of the same size.
//   QUOTE_PHANTOM               Or set the figures directly, in whole tokens
//   QUOTE_GRADUATION_THRESHOLD  (decimals allowed, e.g. "3236.5"). The phantom
//                               is the curve's virtual starting reserve; the
//                               threshold is the real quote raised at which
//                               the launch graduates to Uniswap V4. Only their
//                               ratio shapes the curve.
//   QUOTE_DECIMALS              Optional. The scale both figures are sized
//                               against, checked by the factory against the
//                               token's own decimals(). Defaults to decimals().
//   QUOTE_APPROVED              Optional. "false" revokes approval for new
//                               launches and leaves the economics as they are.
//
// Economics only govern launches created afterwards; running this again with
// new figures re-pegs the asset without touching existing curves.
import { Contract, formatUnits, isAddress, parseUnits } from "ethers";
import { network } from "hardhat";
import { deploymentPath, readDeployment } from "../lib/deployments.js";
import { row } from "../lib/forkHarness.js";

const { ethers, networkName } = await network.getOrCreate();
const [signer] = await ethers.getSigners();

const token = process.env.QUOTE_TOKEN ?? "";
if (!isAddress(token)) throw new Error("Set QUOTE_TOKEN to the ERC-20 address to approve.");

const file = deploymentPath(networkName);
const d = readDeployment(file);
const factory = await ethers.getContractAt("PonsV2LaunchFactory", d.factory, signer);

row("deployment", file);
row("factory", d.factory);
row("quote token", token);

if (process.env.QUOTE_APPROVED === "false") {
  await (await factory.setPairTokenApproved(token, false)).wait();
  row("approved", await factory.approvedPairTokens(token));
  process.exit(0);
}

const erc20 = new Contract(
  token,
  ["function decimals() view returns (uint8)", "function symbol() view returns (string)"],
  signer,
);
const decimals = process.env.QUOTE_DECIMALS ? Number(process.env.QUOTE_DECIMALS) : Number(await erc20.decimals());
const symbol: string = await erc20.symbol().catch(() => "?");

let phantomQuote: bigint;
let graduationThreshold: bigint;
if (process.env.QUOTE_PER_NATIVE) {
  // Native figures are 18-decimal wei. Scale them by the rate, then from 18
  // decimals to the token's own.
  const native = await factory.getLaunchConfig(0n);
  const rate = parseUnits(process.env.QUOTE_PER_NATIVE, 18);
  const scale = (wei: bigint) => (wei * rate * 10n ** BigInt(decimals)) / 10n ** 36n;
  phantomQuote = scale(native.phantomQuote);
  graduationThreshold = scale(native.graduationThreshold);
} else if (process.env.QUOTE_PHANTOM && process.env.QUOTE_GRADUATION_THRESHOLD) {
  phantomQuote = parseUnits(process.env.QUOTE_PHANTOM, decimals);
  graduationThreshold = parseUnits(process.env.QUOTE_GRADUATION_THRESHOLD, decimals);
} else {
  throw new Error("Set QUOTE_PER_NATIVE, or both QUOTE_PHANTOM and QUOTE_GRADUATION_THRESHOLD.");
}

row("symbol", symbol);
row("decimals", decimals);
row("phantomQuote", `${formatUnits(phantomQuote, decimals)} (${phantomQuote} base units)`);
row("graduationThreshold", `${formatUnits(graduationThreshold, decimals)} (${graduationThreshold} base units)`);

await (await factory.setPairTokenEconomics(token, phantomQuote, graduationThreshold, decimals)).wait();
await (await factory.setPairTokenApproved(token, true)).wait();
row("approved", await factory.approvedPairTokens(token));
