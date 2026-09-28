import type { Address } from "viem";
import { feedsHere } from "@/features/market/dollar-rates/feeds";
import { readFeed } from "@/lib/chainlink/client";
import { logger } from "@/lib/logger";
import { cached } from "@/lib/redis/cache";

// Each quote asset's dollar rate, by its lowercase address. A quote asset missing from it
// has no rate.
export type DollarRates = ReadonlyMap<string, number>;

// A stock feed moves every few minutes at most, and a rate is only shown, so one read a
// minute per feed serves every visitor.
const TTL_SECONDS = 60;

// How long a feed that could not be read goes unasked. A dead node takes the read's
// whole timeout to fail, and every list that misses its cache waits on the rates, so
// asking on every miss would slow every list while the node is down. Half the rate's
// own hold, so a node that comes back is priced again soon after.
const UNREADABLE_TTL_SECONDS = 30;

// A feed that cannot be read gives no rate rather than failing the market route that
// asked, and that missing rate is held like a rate is, for less time. The key is v2
// because an entry may now hold null.
const readRate = (feed: Address): Promise<number | null> =>
  cached(
    `dollar-rate:v2:${feed.toLowerCase()}`,
    (rate) => (rate === null ? UNREADABLE_TTL_SECONDS : TTL_SECONDS),
    () =>
      readFeed(feed).catch((error: unknown) => {
        logger.warn("dollar rate unreadable", {
          feed,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }),
  );

// One quote asset's dollar rate. Null while the switch is off, for a quote asset the
// table names no feed for, and for a feed that cannot be read.
export const readDollarRate = async (quote: string): Promise<number | null> => {
  const feed = feedsHere()[quote.toLowerCase()];

  return feed ? readRate(feed) : null;
};

// The dollar rate of every quote asset the table prices on this chain, for a list whose
// tokens may trade against any of them.
export const readDollarRates = async (): Promise<DollarRates> => {
  const rates = await Promise.all(
    Object.entries(feedsHere()).map(
      async ([quote, feed]) => [quote, await readRate(feed)] as const,
    ),
  );

  return new Map(rates.filter((entry): entry is [string, number] => entry[1] !== null));
};
