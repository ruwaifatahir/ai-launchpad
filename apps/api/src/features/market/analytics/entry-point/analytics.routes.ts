import { Router } from "express";
import { marketLimiter } from "@/features/market/limiter";
import { getAnalytics } from "@/features/market/analytics/entry-point/analytics.controller";

const router = Router();

/**
 * @openapi
 * /api/v1/market/analytics:
 *   get:
 *     tags: [Market]
 *     operationId: getAnalytics
 *     summary: The launchpad's volume, launches and creators, by UTC day and in total
 *     description: >
 *       Every figure the Analytics page shows, for the whole launchpad. Read from the
 *       indexer. Public: no credential is needed. Takes no query.
 *
 *
 *       A day is a UTC day, keyed by its first second. Every figure stops at the end of
 *       the last full UTC day, which is yesterday in UTC: the totals, the series and
 *       the creator count. Today so far is never counted, so the cards and the charts
 *       always agree.
 *
 *
 *       series holds one entry per day, oldest first, from the first launch's day to
 *       the last full day. A day with no launch and no trade is in it with zeros.
 *       lastDay is its last entry and priorDay the one before. The change between
 *       them is not sent.
 *
 *
 *       Volume counts user buys and sells, and leaves out buybacks and fee
 *       conversions. It is served in US dollars only. Each day is converted at that
 *       day's daily rate, the quote asset's Chainlink answer at the close of the day,
 *       which the backend stores once, so an old day never changes with the rate.
 *
 *
 *       A day whose rate is not stored yet has a null volumeUsd, never zero.
 *       totals.volumeUsd adds up the other days, and totals.unpricedDays counts the
 *       ones it left out. A quote asset with no feed at all is left out of every
 *       dollar figure and named in unpricedQuoteAssets, so the total is partial.
 *       While dollar rates are off every volumeUsd is null, and launches and creators
 *       are still served.
 *
 *
 *       With no launch yet, or none before today, the series is empty, every total
 *       is zero, and lastFullDay, lastDay and priorDay are null.
 *
 *
 *       The backend holds the answer until the next midnight UTC, or for five minutes
 *       while any day is unpriced, so a rate stored since shows up soon. It never
 *       holds a 503, so the next request asks again. A success carries
 *       `Cache-Control: public, max-age=5`.
 *     responses:
 *       200:
 *         description: The launchpad's figures to the end of the last full UTC day
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalyticsResponse'
 *       429:
 *         description: Rate limited, keyed by IP, on a budget counted apart from the creator routes
 *       503:
 *         description: INDEXER_UNAVAILABLE when the indexer's database did not answer, or INDEXER_BUSY with Retry-After 1 when every connection to it was taken. Both are worth retrying.
 */
router.get("/analytics", marketLimiter, getAnalytics);

export default router;
