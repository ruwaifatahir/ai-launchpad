import { AbiCoder, keccak256, type Signer } from "ethers";

/** PoolKey as V4 encodes it. `hooks` is the hook address. */
export interface PoolKeyStruct {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";

// ── chain control ────────────────────────────────────────────────────────────

/** Impersonate an address on the fork and return it as a usable signer. */
export async function impersonate(ethers: any, address: string, fundWith = 10n ** 19n): Promise<Signer> {
  await ethers.provider.send("hardhat_impersonateAccount", [address]);
  if (fundWith > 0n) await fund(ethers, address, fundWith);
  return await ethers.getSigner(address);
}

export async function stopImpersonating(ethers: any, address: string): Promise<void> {
  await ethers.provider.send("hardhat_stopImpersonatingAccount", [address]);
}

/** Set an account's native balance outright. */
export async function fund(ethers: any, address: string, wei: bigint): Promise<void> {
  await ethers.provider.send("hardhat_setBalance", [address, "0x" + wei.toString(16)]);
}

/** Advance the fork clock and mine, so time-dependent logic actually moves. */
export async function warp(ethers: any, seconds: number | bigint): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
  await ethers.provider.send("evm_mine", []);
}

export async function mine(ethers: any, count = 1): Promise<void> {
  for (let i = 0; i < count; i++) await ethers.provider.send("evm_mine", []);
}

export async function blockTimestamp(ethers: any): Promise<number> {
  return (await ethers.provider.getBlock("latest"))!.timestamp;
}

// ── V4 pool identity ─────────────────────────────────────────────────────────

/**
 * Mirrors PonsV2LaunchFactory._sortCurrencies: native ETH sorts below every
 * ERC-20, otherwise currencies sort by address. The launch token's side of the
 * pool depends on this, and so does the seed price.
 */
export function poolKeyFor(
  token: string,
  pairToken: string,
  poolFee: number,
  tickSpacing: number,
  hook: string,
): { key: PoolKeyStruct; memecoinIsCurrency0: boolean } {
  const memecoinIsCurrency0 =
    pairToken === ZERO ? false : BigInt(token) < BigInt(pairToken);
  const [currency0, currency1] = memecoinIsCurrency0 ? [token, pairToken] : [pairToken, token];
  return {
    key: { currency0, currency1, fee: poolFee, tickSpacing, hooks: hook },
    memecoinIsCurrency0,
  };
}

/** poolId = keccak256(abi.encode(PoolKey)). */
export function computePoolId(key: PoolKeyStruct): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["(address,address,uint24,int24,address)"],
      [[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]],
    ),
  );
}

// ── narration ────────────────────────────────────────────────────────────────

export function step(n: number | string, msg: string): void {
  const head = `── ${n}. ${msg} `;
  console.log(`\n${head}${"─".repeat(Math.max(2, 74 - head.length))}`);
}

export function row(label: string, value: unknown, width = 34): void {
  console.log(`   ${String(label).padEnd(width)} ${value}`);
}

export interface RevertOutcome {
  reverted: boolean;
  name: string | null;
  matched: boolean;
  raw?: string;
}

/**
 * Runs `promise` expecting it to revert with `expectedError`, prints the
 * outcome, and returns rather than throwing. Scenarios are transcripts: one
 * surprise should be visible in the output, not abort the remaining steps.
 */
export async function expectRevert(
  promise: Promise<unknown>,
  expectedError: string,
  label?: string,
): Promise<RevertOutcome> {
  const what = label ?? expectedError;
  try {
    await promise;
    console.log(`   ✘ ${what.padEnd(46)} did NOT revert`);
    return { reverted: false, name: null, matched: false };
  } catch (e: any) {
    const name: string | null =
      e?.errorName ??
      e?.error?.errorName ??
      (typeof e?.shortMessage === "string" ? extractErrorName(e.shortMessage) : null) ??
      extractErrorName(String(e?.message ?? e));
    const matched = name === expectedError;
    console.log(
      `   ${matched ? "✔" : "✘"} ${what.padEnd(46)} reverted with ${name ?? "(undecoded)"}`,
    );
    return { reverted: true, name, matched, raw: String(e?.shortMessage ?? e?.message ?? e) };
  }
}

function extractErrorName(message: string): string | null {
  const custom = message.match(/reverted with custom error '([A-Za-z0-9_]+)/);
  if (custom) return custom[1];
  const panic = message.match(/reverted with panic code (0x[0-9a-fA-F]+)/);
  if (panic) return `Panic(${panic[1]})`;
  const reason = message.match(/reverted with reason string '([^']+)'/);
  if (reason) return reason[1];
  return null;
}

/** Decoded event args for one event name out of a receipt, in order. */
export function eventsFrom(receipt: any, iface: any, name: string): any[] {
  return receipt.logs
    .map((l: any) => {
      try {
        return iface.parseLog(l);
      } catch {
        return null;
      }
    })
    .filter((p: any) => p?.name === name);
}

export function firstEvent(receipt: any, iface: any, name: string): any | null {
  return eventsFrom(receipt, iface, name)[0] ?? null;
}
