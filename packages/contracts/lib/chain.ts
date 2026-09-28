import { Contract, isAddress, type Provider } from "ethers";
import { EXTERNAL } from "../config/pons.js";

/** The Uniswap V4 contracts a deployment reuses rather than deploys. */
export interface UniswapV4 {
  poolManager: string;
  positionManager: string;
  permit2: string;
}

/**
 * Robinhood Chain mainnet and testnet share one set of Uniswap V4 addresses,
 * recorded in config/pons.ts. Only these chains may fall back to them: on any
 * other chain the same address is at best empty and at worst someone else's
 * contract, so a silent default would be worse than a failure.
 */
const ROBINHOOD_CHAIN_IDS = new Set([4663n, 46630n]);

const ENV = {
  poolManager: "POOL_MANAGER",
  positionManager: "POSITION_MANAGER",
  permit2: "PERMIT2",
} as const;

const LABEL = {
  poolManager: "Uniswap V4 PoolManager",
  positionManager: "Uniswap V4 PositionManager",
  permit2: "Permit2",
} as const;

/**
 * Reads the Uniswap V4 addresses for `chainId` from POOL_MANAGER,
 * POSITION_MANAGER and PERMIT2, falling back to the Robinhood values on
 * chains 4663 and 46630 only. Throws naming every variable that is missing or
 * malformed, so one run reports everything there is to fix.
 */
export function resolveUniswapV4(chainId: bigint): UniswapV4 {
  const fallback = ROBINHOOD_CHAIN_IDS.has(chainId);
  const problems: string[] = [];
  const pick = (key: keyof UniswapV4): string => {
    const name = ENV[key];
    const value = process.env[name]?.trim();
    if (!value) {
      if (fallback) return EXTERNAL[key];
      problems.push(`${name} is not set. Chain ${chainId} has no built-in default; set it to the ${LABEL[key]} address on this chain.`);
      return "";
    }
    if (!isAddress(value)) problems.push(`${name}=${value} is not an address.`);
    return value;
  };
  const resolved = { poolManager: pick("poolManager"), positionManager: pick("positionManager"), permit2: pick("permit2") };
  if (problems.length) throw new Error(`Uniswap V4 addresses are incomplete:\n  - ${problems.join("\n  - ")}`);
  return resolved;
}

/**
 * Proves on chain that everything the deployment depends on is really there,
 * before the first transaction spends gas. The factory constructor would catch
 * a mismatched PositionManager too, but only after the escrow, hook, vault and
 * locker had been paid for.
 */
export async function preflight(provider: Provider, v4: UniswapV4): Promise<void> {
  const problems: string[] = [];
  const hasCode = async (address: string) => (await provider.getCode(address)) !== "0x";

  if (!(await hasCode(EXTERNAL.create2Deployer))) {
    problems.push(
      `No CREATE2 deployer at ${EXTERNAL.create2Deployer}. The hook must be deployed through Arachnid's ` +
        `deterministic deployer; deploy it on this chain first (github.com/Arachnid/deterministic-deployment-proxy).`,
    );
  }
  for (const key of ["poolManager", "positionManager", "permit2"] as const) {
    if (!(await hasCode(v4[key]))) {
      problems.push(`${ENV[key]}=${v4[key]} has no code on this chain; set it to the ${LABEL[key]} address here.`);
    }
  }
  if (!problems.some((p) => p.startsWith(ENV.positionManager) || p.startsWith(ENV.poolManager))) {
    const pm = new Contract(v4.positionManager, ["function poolManager() view returns (address)"], provider);
    try {
      const wired: string = await pm.poolManager();
      if (wired.toLowerCase() !== v4.poolManager.toLowerCase()) {
        problems.push(
          `POSITION_MANAGER=${v4.positionManager} is wired to PoolManager ${wired}, not POOL_MANAGER=${v4.poolManager}. ` +
            `Set the pair that belongs together.`,
        );
      }
    } catch (e) {
      const reason = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      problems.push(
        `POSITION_MANAGER=${v4.positionManager} did not answer poolManager() (${reason}); it may not be a V4 PositionManager.`,
      );
    }
  }
  if (problems.length) throw new Error(`Pre-flight checks failed:\n  - ${problems.join("\n  - ")}`);
}
