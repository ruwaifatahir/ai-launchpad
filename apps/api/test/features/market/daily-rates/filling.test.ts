import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Chainlink contract read is faked at the viem level, so the round search runs for
// real against feeds laid out below. The indexer's first launch and Prisma are faked.
const { readContract } = vi.hoisted(() => ({ readContract: vi.fn() }));

vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: vi.fn(() => ({ readContract })),
}));

vi.mock("@/features/market/analytics/analytics.repo", () => ({
  findFirstLaunchAt: vi.fn(),
}));

import { fillDailyRates } from "@/features/market/daily-rates/filling";
import { findFirstLaunchAt } from "@/features/market/analytics/analytics.repo";
import { logger } from "@/lib/logger";
import { TEST_ENV } from "@test/helpers/env.mock";
import { prismaMock } from "@test/helpers/prisma.mock";

const ETH = "0x0000000000000000000000000000000000000000";
const NVDA = "0x0ae6ab900fc7f3be5bd9f5137827fa99200373f7";
const ETH_USD = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";
const NVDA_USD = "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15";

const DAY = 86_400;
const HOUR = 3_600;

// 2026-09-20 to 2026-09-24, each the start of its UTC day. The clock stands at noon on
// 2026-09-25, so 09-24 is the last full day.
const D20 = Date.UTC(2026, 8, 20) / 1000;
const D21 = D20 + DAY;
const D22 = D21 + DAY;
const D23 = D22 + DAY;
const D24 = D23 + DAY;
const NOW = (D24 + DAY + 12 * HOUR) * 1000;

const PHASE = 1n << 64n;

interface FakeRound {
  answer: bigint;
  updatedAt: number;
}

// A feed's rounds in phase 1, first to latest, as getRoundData serves them.
const feeds = new Map<string, FakeRound[]>();

const roundData = (rounds: FakeRound[], index: number) => {
  const round = rounds[index];
  if (!round) throw new Error("No data present");

  const id = PHASE + BigInt(index + 1);
  return [id, round.answer, BigInt(round.updatedAt), BigInt(round.updatedAt), id];
};

const serveFeeds = () =>
  readContract.mockImplementation(
    async (call: { address: string; functionName: string; args?: [bigint] }) => {
      const rounds = feeds.get(call.address);
      if (!rounds) throw new Error(`no feed at ${call.address}`);

      if (call.functionName === "decimals") return 8;
      if (call.functionName === "latestRoundData")
        return roundData(rounds, rounds.length - 1);

      return roundData(rounds, Number(call.args![0] - PHASE) - 1);
    },
  );

// A round every hour from start for the given number of hours, each answering its own
// hour's number above base, so a test can tell which round a day took.
const hourly = (start: number, hours: number, base: bigint) =>
  Array.from({ length: hours }, (_, i) => ({
    answer: base + BigInt(i),
    updatedAt: start + i * HOUR,
  }));

const stored = () =>
  prismaMock.dailyRate.createMany.mock.calls.map(([{ data }]) => data[0]);

const storedDays = (quoteAsset: string) =>
  stored()
    .filter((row) => row.quoteAsset === quoteAsset)
    .map((row) => row.day.toISOString().slice(0, 10));

beforeEach(() => {
  TEST_ENV.DOLLAR_RATES = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);

  feeds.clear();
  // ETH rounds every hour from 09-19 to past now. NVDA only from 09-22 at 09:30.
  feeds.set(ETH_USD, hourly(D20 - DAY, 7 * 24, 2_600_00000000n));
  feeds.set(NVDA_USD, hourly(D22 + 9 * HOUR + 1800, 24, 225_00000000n));
  serveFeeds();

  vi.mocked(findFirstLaunchAt).mockResolvedValue(D20 + 15 * HOUR);
  prismaMock.dailyRate.findMany.mockResolvedValue([]);
  prismaMock.dailyRate.createMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  TEST_ENV.DOLLAR_RATES = false;
  vi.useRealTimers();
});

describe("fillDailyRates", () => {
  it("stores every day from the first launch's day to the last full day, never today", async () => {
    await fillDailyRates();

    expect(storedDays(ETH)).toEqual([
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ]);
  });

  it("stores the answer of the last round updated before the day's midnight", async () => {
    await fillDailyRates();

    // ETH's rounds start 09-19 at 00:00, one an hour. The last before 09-21 00:00 is
    // the 47th, which answers base + 47.
    const d20 = stored().find(
      (row) => row.quoteAsset === ETH && row.day.getTime() === D20 * 1000,
    );

    expect(d20).toEqual({
      chainId: 46630,
      quoteAsset: ETH,
      day: new Date(D20 * 1000),
      answer: (2_600_00000000n + 47n).toString(),
      decimals: 8,
      feed: ETH_USD,
      roundId: (PHASE + 48n).toString(),
      roundUpdatedAt: new Date((D21 - HOUR) * 1000),
    });
  });

  it("does not take a round updated at midnight itself, which belongs to the next day", async () => {
    await fillDailyRates();

    const d24 = stored().find(
      (row) => row.quoteAsset === ETH && row.day.getTime() === D24 * 1000,
    );

    expect(d24?.roundUpdatedAt).toEqual(new Date((D24 + DAY - HOUR) * 1000));
  });

  it("takes the feed's latest answer for a day that closed after it stopped moving, as a stock feed does over a weekend", async () => {
    await fillDailyRates();

    const nvda = stored().filter((row) => row.quoteAsset === NVDA);
    const latest = (225_00000000n + 23n).toString();

    expect(nvda.map((row) => row.day.toISOString().slice(0, 10))).toEqual([
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ]);
    expect(nvda[1].answer).toBe(latest);
    expect(nvda[2].answer).toBe(latest);
  });

  it("stores nothing for a day before the feed's first round", async () => {
    await fillDailyRates();

    expect(storedDays(NVDA)).not.toContain("2026-09-20");
    expect(storedDays(NVDA)).not.toContain("2026-09-21");
  });

  it("skips the days already stored, and reads no chain for a feed with none missing", async () => {
    prismaMock.dailyRate.findMany.mockImplementation(async ({ where }) =>
      where.quoteAsset === ETH
        ? [D20, D21, D22, D23, D24].map((day) => ({ day: new Date(day * 1000) }))
        : [{ day: new Date(D22 * 1000) }],
    );

    await fillDailyRates();

    expect(storedDays(ETH)).toEqual([]);
    expect(storedDays(NVDA)).toEqual(["2026-09-23", "2026-09-24"]);
    expect(readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ address: ETH_USD }),
    );
  });

  it("asks for the stored days of this chain and quote asset", async () => {
    await fillDailyRates();

    expect(prismaMock.dailyRate.findMany).toHaveBeenCalledWith({
      where: { chainId: 46630, quoteAsset: ETH },
      select: { day: true },
    });
  });

  it("writes each day so a second run at once skips it rather than storing it twice", async () => {
    await fillDailyRates();

    for (const [call] of prismaMock.dailyRate.createMany.mock.calls)
      expect(call.skipDuplicates).toBe(true);
  });

  it.each([
    ["zero", 0n],
    ["below zero", -1n],
  ])(
    "rejects an answer of %s, storing nothing for that day alone",
    async (_label, bad) => {
      const rounds = feeds.get(NVDA_USD)!;
      rounds[14] = { ...rounds[14], answer: bad };

      await fillDailyRates();

      // Round 15 is the last before 09-23 00:00, the close of 09-22.
      expect(storedDays(NVDA)).toEqual(["2026-09-23", "2026-09-24"]);
      expect(logger.warn).toHaveBeenCalledWith(
        "daily rate rejected",
        expect.objectContaining({ feed: NVDA_USD, answer: bad.toString() }),
      );
    },
  );

  it("skips a feed that cannot be read, logs it, and still fills the others", async () => {
    feeds.delete(NVDA_USD);

    await fillDailyRates();

    expect(storedDays(NVDA)).toEqual([]);
    expect(storedDays(ETH)).toHaveLength(5);
    expect(logger.warn).toHaveBeenCalledWith(
      "daily rate feed unreadable",
      expect.objectContaining({ feed: NVDA_USD, quoteAsset: NVDA }),
    );
  });

  it("keeps the days it stored before a feed failed partway", async () => {
    const rounds = feeds.get(ETH_USD)!;
    readContract.mockImplementation(async (call) => {
      if (call.functionName === "getRoundData" && call.args[0] > PHASE + 100n)
        throw new Error("node down");
      if (call.functionName === "decimals") return 8;
      if (call.functionName === "latestRoundData")
        return roundData(rounds, rounds.length - 1);
      return roundData(rounds, Number(call.args[0] - PHASE) - 1);
    });
    feeds.delete(NVDA_USD);

    await fillDailyRates();

    expect(storedDays(ETH).length).toBeGreaterThan(0);
    expect(storedDays(ETH).length).toBeLessThan(5);
  });

  it("stores nothing while dollar rates are off, and reads neither the indexer nor a feed", async () => {
    TEST_ENV.DOLLAR_RATES = false;

    await fillDailyRates();

    expect(prismaMock.dailyRate.createMany).not.toHaveBeenCalled();
    expect(findFirstLaunchAt).not.toHaveBeenCalled();
    expect(readContract).not.toHaveBeenCalled();
  });

  it("stores nothing before the first launch", async () => {
    vi.mocked(findFirstLaunchAt).mockResolvedValue(null);

    await fillDailyRates();

    expect(prismaMock.dailyRate.createMany).not.toHaveBeenCalled();
    expect(readContract).not.toHaveBeenCalled();
  });

  it("stores nothing when the first launch was today, since no day has closed since", async () => {
    vi.mocked(findFirstLaunchAt).mockResolvedValue(NOW / 1000 - HOUR);

    await fillDailyRates();

    expect(prismaMock.dailyRate.createMany).not.toHaveBeenCalled();
  });
});
