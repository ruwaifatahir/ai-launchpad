import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeEventLog, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { PonsV2LaunchFactoryAbi } from "../abis/PonsV2LaunchFactoryAbi";
import { PonsV2MemeHookAbi } from "../abis/PonsV2MemeHookAbi";
import { PoolManagerAbi } from "../abis/PoolManagerAbi";
import {
  curveMarketCap,
  curveReservesAfter,
  poolMarketCap,
  poolPriceAt,
} from "../src/market-cap";
import type { RawLog } from "../src/trades";
import { load, lower } from "./fixture";

const fixturesDir = join(import.meta.dirname, "fixtures");

// A Pons mainnet curve's every log, and its reserves read at the last block, as written by
// scripts/record-curve-history.ts.
type CurveHistory = {
  phantomQuote: string;
  launchSupply: string;
  expected: { realQuoteReserve: string; tokenReserve: string };
  logs: RawLog[];
};

function curveHistory(name: string): CurveHistory {
  return JSON.parse(
    readFileSync(join(fixturesDir, "curve-history", `${name}.json`), "utf8"),
  ) as CurveHistory;
}

// What the handlers do: a launch starts with an empty quote reserve and its whole supply
// on the curve, and every curve log moves the reserves.
function replay(history: CurveHistory) {
  return history.logs.reduce(curveReservesAfter, {
    quoteReserve: 0n,
    tokenReserve: BigInt(history.launchSupply),
  });
}

// A testnet graduation's receipt: our TMEME, quoted in NVDA.
type Graduation = {
  token: Address;
  quoteAsset: Address;
  poolId: Hex;
  poolManager: Address;
  logs: RawLog[];
};
const tmeme = JSON.parse(
  readFileSync(join(fixturesDir, "graduation", "tmeme.json"), "utf8"),
) as Graduation;

// TMEME's curve, read from testnet: 16.64 NVDA of phantom quote, graduating at 41.6 NVDA,
// with 1B tokens.
const tmemeCurve = {
  phantomQuote: 16_640_000_000_000_000_000n,
  graduationThreshold: 41_600_000_000_000_000_000n,
  supply: 10n ** 27n,
};

function relativeGap(a: bigint, b: bigint): number {
  return Math.abs(Number(a - b)) / Number(b);
}

describe("curve reserves", () => {
  // ACCR has 357 buys, 208 sells and 71 curve buybacks.
  it("replays a mainnet curve's whole history to its reserves on chain", () => {
    const history = curveHistory("accr");

    expect(replay(history)).toEqual({
      quoteReserve: BigInt(history.expected.realQuoteReserve),
      tokenReserve: BigInt(history.expected.tokenReserve),
    });
  });

  it("stays at the launch's opening reserves without a trade", () => {
    const history = curveHistory("side-eye");

    expect(replay(history)).toEqual({
      quoteReserve: BigInt(history.expected.realQuoteReserve),
      tokenReserve: BigInt(history.expected.tokenReserve),
    });
  });
});

describe("curve market cap", () => {
  // A new ETH launch on Pons is worth its 1.68 ETH of phantom quote.
  it("is the phantom quote for a launch with no trade yet", () => {
    const history = curveHistory("side-eye");
    const supply = BigInt(history.launchSupply);

    expect(
      curveMarketCap(
        { phantomQuote: BigInt(history.phantomQuote), ...replay(history) },
        supply,
      ),
    ).toBe(BigInt(history.phantomQuote));
  });

  it("falls with the supply after a burn, at the same price", () => {
    const history = curveHistory("accr");
    const curve = { phantomQuote: BigInt(history.phantomQuote), ...replay(history) };
    const supply = BigInt(history.launchSupply);

    expect(
      relativeGap(curveMarketCap(curve, supply / 2n) * 2n, curveMarketCap(curve, supply)),
    ).toBeLessThan(1e-15);
  });
});

describe("pool market cap", () => {
  const graduated = tmeme.logs.find((log) => {
    try {
      return (
        decodeEventLog({ abi: PonsV2LaunchFactoryAbi, ...log }).eventName ===
        "PoolGraduated"
      );
    } catch {
      return false;
    }
  });
  if (!graduated) throw new Error("No PoolGraduated in the TMEME fixture");

  const opening = poolPriceAt(graduated, tmeme);

  it("opens at the pool's Initialize price, in the graduation transaction", () => {
    expect(opening).toBe(175482930525847350726226653184318n);
  });

  // The factory seeds the pool at the curve's last price, so the market cap carries on:
  // at graduation the curve holds phantom + threshold of quote against
  // supply × phantom / (phantom + threshold) tokens.
  it("carries on from the curve's market cap at graduation", () => {
    const { phantomQuote, graduationThreshold, supply } = tmemeCurve;
    const curveAtGraduation = curveMarketCap(
      {
        phantomQuote,
        quoteReserve: graduationThreshold,
        tokenReserve: (supply * phantomQuote) / (phantomQuote + graduationThreshold),
      },
      supply,
    );
    const pool = poolMarketCap(
      { sqrtPriceX96: opening!, launchTokenIsCurrency0: false },
      supply,
    );

    // 203.84 NVDA.
    expect(relativeGap(pool, curveAtGraduation)).toBeLessThan(1e-9);
  });

  it("reads the price the right way up whichever currency the launch token is", () => {
    const flipped = 2n ** 192n / opening!;

    expect(
      relativeGap(
        poolMarketCap(
          { sqrtPriceX96: flipped, launchTokenIsCurrency0: true },
          tmemeCurve.supply,
        ),
        poolMarketCap(
          { sqrtPriceX96: opening!, launchTokenIsCurrency0: false },
          tmemeCurve.supply,
        ),
      ),
    ).toBeLessThan(1e-9);
  });
});

describe("pool price", () => {
  // Four user swaps in one pool, each followed by its HookFeeCollected, beside swaps in
  // other pools of the hook.
  it("is the price after the pool's latest swap before the event", () => {
    const fixture = load("pool-several-swaps");
    const input = {
      poolId: fixture.launch.poolId!,
      poolManager: fixture.poolManager!,
      logs: fixture.logs,
    };
    const swapPrices = fixture.logs.flatMap((log) => {
      if (lower(log.address) !== lower(input.poolManager)) return [];
      const event = decodeEventLog({ abi: PoolManagerAbi, ...log });
      return event.eventName === "Swap" && lower(event.args.id) === lower(input.poolId)
        ? [event.args.sqrtPriceX96]
        : [];
    });
    const hookPrices = fixture.logs
      .filter((log) => {
        if (lower(log.address) !== lower(fixture.hook!)) return false;
        const event = decodeEventLog({ abi: PonsV2MemeHookAbi, ...log });
        return (
          event.eventName === "HookFeeCollected" &&
          lower(event.args.poolId) === lower(input.poolId)
        );
      })
      .map((log) => poolPriceAt(log, input));

    expect(new Set(swapPrices).size).toBe(4);
    expect(hookPrices).toEqual(swapPrices);
  });
});
