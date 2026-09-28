import type { Address } from "viem";
import { env } from "@/config/env";
import { findFirstLaunchAt } from "@/features/market/analytics/analytics.repo";
import {
  createDailyRate,
  findStoredDays,
} from "@/features/market/daily-rates/daily-rates.repo";
import { DAY, dayOf, daysFrom, lastFullDay } from "@/features/market/days";
import { feedsHere } from "@/features/market/dollar-rates/feeds";
import { readFeedHistory } from "@/lib/chainlink/client";
import { logger } from "@/lib/logger";

// Stores each missing day's rate for one quote asset, oldest first, each as soon as it
// is found, so a feed that fails partway keeps the days it reached. A day before the
// feed's first round has no rate, and one whose answer is zero or below stores nothing.
// Either is asked again on the next run.
const fillQuoteAsset = async (quoteAsset: string, feed: Address, days: number[]) => {
  const stored = await findStoredDays(env.CHAIN_ID, quoteAsset);
  const missing = days.filter((day) => !stored.has(day));
  if (missing.length === 0) return;

  const history = await readFeedHistory(feed);

  for (const day of missing) {
    const round = await history.closingRound(day + DAY);
    if (!round) continue;

    if (round.answer <= 0n) {
      logger.warn("daily rate rejected", {
        feed,
        quoteAsset,
        day,
        roundId: round.roundId.toString(),
        answer: round.answer.toString(),
      });
      continue;
    }

    await createDailyRate({
      chainId: env.CHAIN_ID,
      quoteAsset,
      day,
      answer: round.answer,
      decimals: history.decimals,
      feed,
      roundId: round.roundId,
      roundUpdatedAt: round.updatedAt,
    });
  }
};

// Stores the daily rate of every quote asset the feed table prices on this chain, for
// every day from the first launch's day to the last full day that has none. With dollar
// rates off it stores nothing, and turning them on backfills every day on the next run.
//
// A feed that cannot be read is logged and skipped, and the others still fill. The next
// run tries it again, so the job itself is never retried.
export const fillDailyRates = async () => {
  const feeds = Object.entries(feedsHere());
  if (feeds.length === 0) return;

  const firstLaunchAt = await findFirstLaunchAt();
  if (firstLaunchAt === null) return;

  const days = daysFrom(dayOf(firstLaunchAt), lastFullDay());
  if (days.length === 0) return;

  await Promise.all(
    feeds.map(([quoteAsset, feed]) =>
      fillQuoteAsset(quoteAsset, feed, days).catch((error: unknown) => {
        logger.warn("daily rate feed unreadable", {
          feed,
          quoteAsset,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    ),
  );
};
