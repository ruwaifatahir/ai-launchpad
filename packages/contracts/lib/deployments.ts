import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// deploy.ts writes one file per run, named <network>-<chainId>-<unix ms>.json.

const DIR = "deployments";

/**
 * The deployment file to act on: DEPLOYMENT if set, otherwise the newest
 * deployments/*.json, optionally only among those written from `network`.
 * Newest is read from the timestamp in the name rather than the file's mtime,
 * because later scripts write back into older files.
 */
export function deploymentPath(network?: string): string {
  if (process.env.DEPLOYMENT) return process.env.DEPLOYMENT;
  const stamp = (f: string) => Number(f.match(/-(\d+)\.json$/)?.[1] ?? 0);
  const files = existsSync(DIR)
    ? readdirSync(DIR)
        .filter((f) => f.endsWith(".json") && (!network || f.startsWith(`${network}-`)))
        .sort((a, b) => stamp(a) - stamp(b))
    : [];
  const newest = files.at(-1);
  if (!newest) {
    const scope = network ? `deployments/${network}-*.json` : "deployments/*.json";
    throw new Error(`No ${scope} found. Run a deploy first, or set DEPLOYMENT to the file to use.`);
  }
  return join(DIR, newest);
}

export function readDeployment(file: string): Record<string, any> {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeDeployment(file: string, d: Record<string, unknown>): void {
  writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
}
