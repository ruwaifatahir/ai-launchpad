import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import { deployment } from "../src/deployments";
import { burnAddress, isProtocolHolder } from "../src/protocol-holders";

// HELLO's curve on testnet.
const curve = "0xB562F042ccC9638F5Dfd032Bd133764D9d8d1292";
const trader = "0xc65ebf8a8b379bdadb7eb68c97c6a5a043f613ad";

describe("isProtocolHolder", () => {
  it.each([
    ["the PoolManager", deployment.poolManager],
    ["the locker", deployment.locker],
    ["the buyback vault", deployment.buybackVault],
    ["the burn address", burnAddress],
  ] as const)("tags %s", (_, wallet) => {
    expect(isProtocolHolder(wallet, curve)).toBe(true);
  });

  // It holds a pool trade's fee, taken in the launch token, until the fee is swept.
  it("tags the hook, in any letter case", () => {
    expect(isProtocolHolder(deployment.hook.toLowerCase() as Address, curve)).toBe(true);
  });

  it("tags the launch's own curve", () => {
    expect(isProtocolHolder(curve, curve)).toBe(true);
  });

  it("does not tag a trader", () => {
    expect(isProtocolHolder(trader, curve)).toBe(false);
  });

  // The mint in the launch transaction comes before the launch row, so the curve is not
  // known yet.
  it("does not tag a wallet when the curve is not known yet", () => {
    expect(isProtocolHolder(curve, undefined)).toBe(false);
  });
});
