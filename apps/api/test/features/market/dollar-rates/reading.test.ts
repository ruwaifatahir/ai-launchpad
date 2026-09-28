import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the Chainlink read is faked. The table, the switch, the cache and what a failure
// becomes all run for real, over the fake Redis.
vi.mock("@/lib/chainlink/client", () => ({ readFeed: vi.fn() }));

import { readDollarRate, readDollarRates } from "@/features/market/dollar-rates/reading";
import { readFeed } from "@/lib/chainlink/client";
import { logger } from "@/lib/logger";
import { TEST_ENV } from "@test/helpers/env.mock";
import { useFakeRedis } from "@test/helpers/redis.fake";

const eth = "0x0000000000000000000000000000000000000000";
const testNvda = "0x0ae6ab900fc7f3be5bd9f5137827fa99200373f7";
const unlisted = `0x${"c1".repeat(20)}`;

// The Chainlink feeds the test configuration prices each quote asset by.
const ETH_USD = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";
const NVDA_USD = "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15";

const answers: Record<string, number> = { [ETH_USD]: 2691.3, [NVDA_USD]: 225.66 };

const switchRates = (on: boolean) => {
  TEST_ENV.DOLLAR_RATES = on;
};

beforeEach(() => {
  useFakeRedis();
  switchRates(true);
  vi.mocked(readFeed).mockImplementation(async (feed) => answers[feed]);
});

const FEEDS = TEST_ENV.DOLLAR_RATE_FEEDS;

afterEach(() => {
  switchRates(false);
  TEST_ENV.DOLLAR_RATE_FEEDS = FEEDS;
  vi.useRealTimers();
});

describe("readDollarRate", () => {
  it("prices native ETH by the ETH feed", async () => {
    await expect(readDollarRate(eth)).resolves.toBe(2691.3);
  });

  it("prices an ERC-20 quote asset by the feed QUOTE_ASSET_USD_FEEDS names for it", async () => {
    await expect(readDollarRate(testNvda)).resolves.toBe(225.66);
    expect(readFeed).toHaveBeenCalledWith(NVDA_USD);
  });

  it("reads a quote asset in any letter case", async () => {
    await expect(
      readDollarRate(testNvda.toUpperCase().replace("0X", "0x")),
    ).resolves.toBe(225.66);
  });

  it("has no rate for a quote asset the table names no feed for, and reads nothing", async () => {
    await expect(readDollarRate(unlisted)).resolves.toBeNull();
    expect(readFeed).not.toHaveBeenCalled();
  });

  it("has no rate while the switch is on but no feed is configured, and reads nothing", async () => {
    TEST_ENV.DOLLAR_RATE_FEEDS = {};

    await expect(readDollarRate(eth)).resolves.toBeNull();
    expect(readFeed).not.toHaveBeenCalled();
  });

  it("serves no rate at all while the switch is off, and reads nothing", async () => {
    switchRates(false);

    await expect(readDollarRate(eth)).resolves.toBeNull();
    expect(readFeed).not.toHaveBeenCalled();
  });

  it("holds a rate for a minute, so a burst of market reads costs one feed read", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    await readDollarRate(eth);
    vi.setSystemTime(Date.now() + 59_000);
    await readDollarRate(eth);

    expect(readFeed).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2_000);
    await readDollarRate(eth);

    expect(readFeed).toHaveBeenCalledTimes(2);
  });

  it("serves no rate when the feed cannot be read, and says why in the log", async () => {
    vi.mocked(readFeed).mockRejectedValue(new Error("node down"));

    await expect(readDollarRate(eth)).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "dollar rate unreadable",
      expect.objectContaining({ feed: ETH_USD, error: "node down" }),
    );
  });

  it("holds a failure for thirty seconds, so a dead node does not slow every read", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(readFeed).mockRejectedValueOnce(new Error("node down"));

    await readDollarRate(eth);
    vi.setSystemTime(Date.now() + 29_000);

    await expect(readDollarRate(eth)).resolves.toBeNull();
    expect(readFeed).toHaveBeenCalledTimes(1);
  });

  it("asks the feed again once a held failure runs out, sooner than a rate would", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(readFeed).mockRejectedValueOnce(new Error("node down"));

    await readDollarRate(eth);
    vi.setSystemTime(Date.now() + 31_000);

    await expect(readDollarRate(eth)).resolves.toBe(2691.3);
    expect(readFeed).toHaveBeenCalledTimes(2);
  });
});

describe("readDollarRates", () => {
  it("holds a rate for every quote asset on this chain the table prices", async () => {
    const rates = await readDollarRates();

    expect(Object.fromEntries(rates)).toEqual({ [eth]: 2691.3, [testNvda]: 225.66 });
  });

  it("leaves out a quote asset whose feed cannot be read, and keeps the rest", async () => {
    vi.mocked(readFeed).mockImplementation(async (feed) => {
      if (feed === NVDA_USD) throw new Error("node down");
      return answers[feed];
    });

    const rates = await readDollarRates();

    expect(Object.fromEntries(rates)).toEqual({ [eth]: 2691.3 });
  });

  it("holds nothing while the switch is off, and reads nothing", async () => {
    switchRates(false);

    expect((await readDollarRates()).size).toBe(0);
    expect(readFeed).not.toHaveBeenCalled();
  });
});
