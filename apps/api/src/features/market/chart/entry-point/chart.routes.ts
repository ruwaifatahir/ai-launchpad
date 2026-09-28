import { Router } from "express";
import { marketLimiter } from "@/features/market/limiter";
import { getChart } from "@/features/market/chart/entry-point/chart.controller";

const router = Router();

/**
 * @openapi
 * /api/v1/market/tokens/{token}/chart:
 *   get:
 *     tags: [Market]
 *     operationId: getTokenChart
 *     summary: Chart a token's price over a range, in buckets, with the range's % change
 *     description: >
 *       The token's price over the range, from every trade on its bonding curve and,
 *       once it graduates, in its Uniswap pool, so the line runs through graduation
 *       without a break. Read from the indexer, which runs a few seconds behind the
 *       chain. Public: no credential is needed.
 *
 *
 *       Trades are grouped into buckets counted from the unix epoch: 15 seconds for 5m
 *       and 1h, 1 minute for 6h, 5 minutes for 1d and 1 hour for all. all reaches back
 *       to the token's first trade. Only buckets holding a trade are returned, oldest
 *       first, so a quiet stretch is a gap between points rather than a run of empty
 *       ones. A point's price is its bucket's last trade. The protocol's buybacks and
 *       fee conversions are counted in every point, because each moves the price.
 *
 *
 *       The chart is drawn as market cap: a point's price times supply, read in
 *       tokenDecimals. supply is the current supply, after burns. Everything is in
 *       the quote asset; nothing is in dollars.
 *
 *
 *       change is the percentage from the price when the range began to the latest
 *       price. The price when it began is the last trade at or before the range start,
 *       or, for a token with no trade before it, the first trade in the range. A token
 *       with no trade at all has a null change and no points.
 *
 *
 *       The backend holds each token and range for five seconds, so polling faster
 *       than that sees the same answer. It never holds a 404 or a 503, so the next
 *       request asks again. A success carries `Cache-Control: public, max-age=5`,
 *       so a browser answers a poll inside that window itself.
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *       - in: query
 *         name: range
 *         required: true
 *         description: How far back the chart reaches, ending now
 *         schema:
 *           $ref: '#/components/schemas/ChartRange'
 *     responses:
 *       200:
 *         description: The points in the range, with the supply and quote asset to read them as market cap
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChartResponse'
 *       400:
 *         description: An address that is not one, or a range missing or not in the list
 *       404:
 *         description: A token the indexer holds no launch for
 *       429:
 *         description: Rate limited, keyed by IP, on a budget counted apart from the creator routes
 *       503:
 *         description: INDEXER_UNAVAILABLE when the indexer's database did not answer, or INDEXER_BUSY with Retry-After 1 when every connection to it was taken. Both are worth retrying.
 */
router.get("/tokens/:token/chart", marketLimiter, getChart);

export default router;
