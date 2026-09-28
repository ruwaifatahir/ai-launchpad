import { Router } from "express";
import { marketLimiter } from "@/features/market/limiter";
import { getQuoteAssets } from "@/features/market/quote-assets/entry-point/quote-assets.controller";

const router = Router();

/**
 * @openapi
 * /api/v1/market/quote-assets:
 *   get:
 *     tags: [Market]
 *     operationId: listQuoteAssets
 *     summary: List the quote assets tokens trade against, for the search Pair filter
 *     description: >
 *       Every quote asset at least one launched token uses, graduated or not, each
 *       once. Read from the indexer, which runs a few seconds behind the chain. Public:
 *       no credential is needed. Takes no query.
 *
 *
 *       Native ETH is the zero address, with the symbol ETH and 18 decimals. Any other
 *       quote asset carries the symbol and decimals its token reported at launch.
 *       Two quote assets sharing a symbol are listed separately, so the address is what
 *       tells them apart. A pair filter should send the address, not the symbol.
 *
 *
 *       Ordered by symbol, then address. An empty list means no token has launched.
 *
 *
 *       The backend holds the list for five seconds, so polling faster than that sees
 *       the same answer. It never holds a 503, so the next request asks again. A
 *       success carries `Cache-Control: public, max-age=5`, so a browser answers a
 *       poll inside that window itself.
 *     responses:
 *       200:
 *         description: Every quote asset some token uses
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QuoteAssetListResponse'
 *       429:
 *         description: Rate limited, keyed by IP, on a budget counted apart from the creator routes
 *       503:
 *         description: INDEXER_UNAVAILABLE when the indexer's database did not answer, or INDEXER_BUSY with Retry-After 1 when every connection to it was taken. Both are worth retrying.
 */
router.get("/quote-assets", marketLimiter, getQuoteAssets);

export default router;
