// Reports deployed-bytecode size for every first-party Pons V2 contract and
// flags anything at or over the EIP-170 limit.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const EIP170 = 24_576;
const ROOT = join(process.cwd(), "artifacts", "contracts", "src", "v2");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") ? [p] : [];
  });
}

const rows: Array<{ name: string; size: number }> = [];
for (const file of walk(ROOT)) {
  const a = JSON.parse(readFileSync(file, "utf8"));
  const deployed: string | undefined = a.deployedBytecode?.object ?? a.deployedBytecode;
  if (!a.contractName || typeof deployed !== "string" || deployed.length <= 2) continue;
  rows.push({ name: a.contractName, size: (deployed.length - 2) / 2 });
}

rows.sort((x, y) => y.size - x.size);
let over = false;
for (const r of rows) {
  const pct = ((r.size / EIP170) * 100).toFixed(1);
  const flag = r.size >= EIP170 ? "  <-- OVER EIP-170" : "";
  if (r.size >= EIP170) over = true;
  console.log(`${r.name.padEnd(28)} ${String(r.size).padStart(6)} bytes  ${pct.padStart(5)}%  headroom ${EIP170 - r.size}${flag}`);
}
console.log(`\nEIP-170 limit: ${EIP170} bytes`);
if (over) process.exitCode = 1;
