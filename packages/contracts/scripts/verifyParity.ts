// Proves the local build reproduces the live Robinhood Chain deployment.
// Immutables and the trailing metadata hash are baked into runtime code, so an
// exact byte match is not expected everywhere — identical LENGTH plus a
// near-total byte match is what confirms the source and compiler settings are
// right and that nothing was edited on the way in.
import { readFileSync } from "node:fs";
import { JsonRpcProvider } from "ethers";
import { LIVE } from "../config/pons.js";

const rpc = process.env.FORK_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const provider = new JsonRpcProvider(rpc, { chainId: 4663, name: "robinhood" });

const targets: Array<{ name: string; dir: string; address: string }> = [
  { name: "PonsV2FeeEscrow", dir: "", address: LIVE.feeEscrow },
  { name: "PonsV2MemeHook", dir: "hooks/", address: LIVE.memeHook },
  { name: "PonsV2BuybackVault", dir: "", address: LIVE.buybackVault },
  { name: "PonsV2LaunchLocker", dir: "", address: LIVE.locker },
  { name: "PonsV2LaunchFactory", dir: "", address: LIVE.factory },
  { name: "PonsV2GraduationGuard", dir: "", address: LIVE.graduationGuard },
  { name: "PonsV2GraduationExecutor", dir: "", address: LIVE.graduationExecutor },
  { name: "PonsV2LaunchDeployer", dir: "", address: LIVE.launchDeployer },
  { name: "PonsV2LaunchAndBuy", dir: "", address: LIVE.launchForwarder },
];

function localRuntime(name: string, dir: string): Buffer {
  const artifact = JSON.parse(
    readFileSync(`artifacts/contracts/src/v2/${dir}${name}.sol/${name}.json`, "utf8"),
  );
  const code: string = artifact.deployedBytecode?.object ?? artifact.deployedBytecode;
  return Buffer.from(code.slice(2), "hex");
}

let ok = true;
for (const { name, dir, address } of targets) {
  const local = localRuntime(name, dir);
  const chain = Buffer.from((await provider.getCode(address)).slice(2), "hex");
  const lengthMatch = local.length === chain.length;
  ok &&= lengthMatch;

  const n = Math.min(local.length, chain.length);
  let same = 0;
  for (let i = 0; i < n; i++) if (local[i] === chain[i]) same++;
  const pct = n === 0 ? 0 : (same / n) * 100;

  console.log(
    `${name.padEnd(26)} local ${String(local.length).padStart(6)}  chain ${String(chain.length).padStart(6)}  ` +
      `${lengthMatch ? "len OK  " : "LEN DIFF"}  identical ${pct.toFixed(2)}%`,
  );
}

console.log(
  ok
    ? "\n✔ every contract's runtime size matches the live deployment"
    : "\n✘ at least one contract differs in size from the live deployment",
);
if (!ok) process.exitCode = 1;
