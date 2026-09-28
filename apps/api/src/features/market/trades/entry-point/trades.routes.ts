import { Router } from "express";
import { marketLimiter } from "@/features/market/limiter";
import { getTrades } from "@/features/market/trades/entry-point/trades.controller";

const router = Router();

/**
 * @openapi
 * /api/v1/market/tokens/{token}/trades:
 *   get:
 *     tags: [Market]
 *     operationId: listTokenTrades
 *     summary: List a token's trades, newest first, ten a page
 *     description: >
 *       Every trade of the token, on its bonding curve and, once it graduates, in its
 *       Uniswap pool, in one list. Read from the indexer, which runs a few seconds
 *       behind the chain. Public: no credential is needed.
 *
 *
 *       Newest first. Trades in one block share a timestamp, so the block and then the
 *       log index order them within it.
 *
 *
 *       The protocol's own trades are listed too, and kind names them: buyback is the
 *       hook buying the token with collected fees, and fee_conversion is the hook
 *       selling collected fees into the quote asset. Their trader is the wallet that
 *       signed the sweep. Every trader is the wallet that signed the transaction, never
 *       a router or the launch contract.
 *
 *
 *       Amounts are raw integer strings, in the decimals the response names once:
 *       tokenAmount in tokenDecimals and quoteAmount in quoteDecimals. price is a
 *       plain number, the quote amount over the token amount, each in its own
 *       decimals. A pool trade's amounts are before the hook's fee. Everything is in
 *       the quote asset; nothing is in dollars.
 *
 *
 *       A page past the end answers 200 with no trades and the total, so a pager can
 *       still be drawn. A token that was launched moments ago may not have reached the
 *       indexer yet, and answers 404 until it does.
 *
 *
 *       The backend holds each page for five seconds, so polling faster than that sees
 *       the same answer. It never holds a 404 or a 503, so the next request asks again.
 *       A success carries `Cache-Control: public, max-age=5`, so a browser answers a
 *       poll inside that window itself.
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *       - $ref: '#/components/parameters/Page'
 *     responses:
 *       200:
 *         description: One page of trades, with the total and the decimals to read them in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TradePageResponse'
 *       400:
 *         description: An address that is not one, or a page that is not a whole number from 1 to 100000
 *       404:
 *         description: A token the indexer holds no launch for
 *       429:
 *         description: Rate limited, keyed by IP, on a budget counted apart from the creator routes
 *       503:
 *         description: INDEXER_UNAVAILABLE when the indexer's database did not answer, or INDEXER_BUSY with Retry-After 1 when every connection to it was taken. Both are worth retrying.
 */
router.get("/tokens/:token/trades", marketLimiter, getTrades);

export default router;
