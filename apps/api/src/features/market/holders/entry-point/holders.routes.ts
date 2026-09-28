import { Router } from "express";
import { marketLimiter } from "@/features/market/limiter";
import { getHolders } from "@/features/market/holders/entry-point/holders.controller";

const router = Router();

/**
 * @openapi
 * /api/v1/market/tokens/{token}/holders:
 *   get:
 *     tags: [Market]
 *     operationId: listTokenHolders
 *     summary: List a token's holders, largest balance first, ten a page
 *     description: >
 *       Every wallet holding the token, with its share of the current supply. Read from
 *       the indexer, which runs a few seconds behind the chain. Public: no credential
 *       is needed.
 *
 *
 *       Largest balance first, and equal balances by wallet, so paging never repeats or
 *       skips a holder. A wallet that sold out is left out.
 *
 *
 *       The launchpad's own contracts stay in the list, and label says which one each
 *       is: bonding_curve is the token's own curve, uniswap_pool is Uniswap's
 *       PoolManager, which holds every graduated pool's tokens, locker is the launch
 *       locker, buyback_vault is the buyback vault, hook is the launchpad's hook, which
 *       holds fees until they are swept, and burn_address is 0x…dEaD. creator is the
 *       wallet that launched the token. Anyone else has no label.
 *
 *
 *       total is every listed holder, the labelled contracts included, for paging.
 *       holderCount leaves the contracts out, so it counts real holders. The creator
 *       counts.
 *
 *
 *       balance is a raw integer string in tokenDecimals. share is a plain number, a
 *       percent of supply, the token's current supply after burns.
 *
 *
 *       A page past the end answers 200 with no holders and the total, so a pager can
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
 *         description: One page of holders, with the total, the holder count and the supply
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HolderPageResponse'
 *       400:
 *         description: An address that is not one, or a page that is not a whole number from 1 to 100000
 *       404:
 *         description: A token the indexer holds no launch for
 *       429:
 *         description: Rate limited, keyed by IP, on a budget counted apart from the creator routes
 *       503:
 *         description: INDEXER_UNAVAILABLE when the indexer's database did not answer, or INDEXER_BUSY with Retry-After 1 when every connection to it was taken. Both are worth retrying.
 */
router.get("/tokens/:token/holders", marketLimiter, getHolders);

export default router;
