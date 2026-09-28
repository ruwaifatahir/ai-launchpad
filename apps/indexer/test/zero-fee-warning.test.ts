import { describe, expect, it } from "vitest";

import { zeroFeeWarning } from "../src/zero-fee-warning";

// The ids of TMEME's testnet pool. Its real fees are not 0; each test sets its own.
const pool = {
  poolId: "0x174b63f3ffc2a74fb4ee804ee401027bd2144ea846de5751f43668069b1d2b0b",
  launch: "0xA92d2c66716C216A7a7a4fFa0b953167A2bf4cbB",
} as const;

describe("zeroFeeWarning", () => {
  it("warns about a pool with no hook fee and no creator tax, naming launch and pool", () => {
    const warning = zeroFeeWarning({ ...pool, hookFeeBps: 0, creatorTaxBps: 0 });

    expect(warning).toBeDefined();
    expect(warning).toContain(pool.launch);
    expect(warning).toContain(pool.poolId);
  });

  it("stays quiet when the pool takes a hook fee", () => {
    expect(
      zeroFeeWarning({ ...pool, hookFeeBps: 100, creatorTaxBps: 0 }),
    ).toBeUndefined();
  });

  it("stays quiet when the pool takes only a creator tax", () => {
    expect(zeroFeeWarning({ ...pool, hookFeeBps: 0, creatorTaxBps: 50 })).toBeUndefined();
  });
});
