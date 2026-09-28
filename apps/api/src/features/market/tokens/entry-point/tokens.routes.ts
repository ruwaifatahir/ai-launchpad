import { Router } from "express";
import { marketLimiter } from "@/features/market/limiter";
import {
  getCreatorTokens,
  getExplore,
  getGraduated,
  getSearch,
} from "@/features/market/tokens/entry-point/tokens.controller";

const router = Router();

/**
 * @openapi
 * /api/v1/market/tokens/graduated:
 *   get:
 *     tags: [Market]
 *     operationId: listGraduatedTokens
 *     summary: List the graduated tokens, largest market cap first
 *     description: >
 *       Every token whose Uniswap pool has opened. Read from the indexer, which runs a
 *       few seconds behind the chain. Public: no credential is needed.
 *
 *
 *       Graduation takes two transactions: the curve closes, then the pool opens. A
 *       token is listed here once its pool opens. For the few seconds between the two
 *       it is still on its curve and is not listed.
 *
 *
 *       Largest market cap first, and equal market caps by token address, so a token
 *       keeps its page between polls. With dollar rates on, market caps are compared
 *       in dollars and a token whose quote asset has no rate comes last. With them off,
 *       they are compared raw, across quote assets.
 *
 *
 *       marketCap is a raw integer string in the token's quote asset, in its decimals.
 *       logo is exactly what the creator set: an ipfs:// link, an https:// link, or
 *       empty. progress is always 100 here. No FDV is served.
 *
 *
 *       total is every graduated token. A page past the end answers 200 with no tokens
 *       and the total, so a pager can still be drawn.
 *
 *
 *       The backend holds each page for five seconds, so polling faster than that sees
 *       the same answer. It never holds a 503, so the next request asks again. A
 *       success carries `Cache-Control: public, max-age=5`, so a browser answers a
 *       poll inside that window itself.
 *     parameters:
 *       - $ref: '#/components/parameters/ListPage'
 *       - in: query
 *         name: pageSize
 *         required: false
 *         description: Tokens a page. Any other size is refused with a 400.
 *         schema:
 *           $ref: '#/components/schemas/PageSize'
 *           default: 10
 *     responses:
 *       200:
 *         description: One page of graduated tokens, with the total
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GraduatedPageResponse'
 *       400:
 *         description: A page that is not a whole number from 1 to 100000, or a page size outside 6, 10, 20, 24 and 50
 *       429:
 *         description: Rate limited, keyed by IP, on a budget counted apart from the creator routes
 *       503:
 *         description: INDEXER_UNAVAILABLE when the indexer's database did not answer, or INDEXER_BUSY with Retry-After 1 when every connection to it was taken. Both are worth retrying.
 */
router.get("/tokens/graduated", marketLimiter, getGraduated);

/**
 * @openapi
 * /api/v1/market/tokens/explore:
 *   get:
 *     tags: [Market]
 *     operationId: listExploreTokens
 *     summary: List the tokens still on their curve, by recent buys, newest, oldest, market cap or volume
 *     description: >
 *       Every token whose Uniswap pool has not opened. Read from the indexer, which runs
 *       a few seconds behind the chain. Public: no credential is needed.
 *
 *
 *       Graduation takes two transactions: the curve closes, then the pool opens. For
 *       the few seconds between the two a token is still listed here, its progress
 *       capped at 100. Once its pool opens it moves to the graduated list.
 *
 *
 *       recent-buys orders by the latest user buy, latest first, and leaves out every
 *       token nobody has bought. newest and oldest order by launch time. market-cap
 *       orders by market cap, largest first. volume orders by the volume traded
 *       inside the age window, largest first, and leaves out every token with none
 *       there. Both compare in dollars while dollar rates are on, a token with no rate
 *       last, and raw amounts across quote assets while they are off. Every order ends
 *       on the token address, so a token keeps its page between polls.
 *
 *
 *       age narrows the list to a window ending now. Under recent-buys it keeps tokens
 *       whose last buy is inside it. Under newest, oldest and market-cap it keeps
 *       tokens launched inside it. Under volume it is the window the volume is summed
 *       over. Under 24h and 7d that is the indexer's hourly volume over the last 24
 *       or 168 hours. Only whole hours count, so the hour the window opens in is
 *       missed. Under all it is the token's all time volume.
 *
 *
 *       marketCap is a raw integer string in the token's quote asset, in its decimals.
 *       Under volume alone each token also carries volume, the same way. It is the
 *       volume over the window. Volume counts user buys and sells. It leaves out
 *       buybacks and fee conversions.
 *       logo is exactly what the creator set: an ipfs:// link, an https:// link, or
 *       empty. No FDV is served.
 *
 *
 *       total is every token matching the sort and age. launched is every token ever
 *       launched, graduated or not. A page past the end answers 200 with no tokens and
 *       both totals, so a pager can still be drawn.
 *
 *
 *       The backend holds each page for five seconds, measuring the age window from
 *       when it read the indexer, so polling faster than that sees the same answer. It
 *       never holds a 503, so the next request asks again. A success carries
 *       `Cache-Control: public, max-age=5`, so a browser answers a poll inside that
 *       window itself.
 *     parameters:
 *       - in: query
 *         name: sort
 *         required: false
 *         description: The order. Anything else is refused with a 400.
 *         schema:
 *           $ref: '#/components/schemas/ExploreSort'
 *           default: recent-buys
 *       - in: query
 *         name: age
 *         required: false
 *         description: How far back the list reaches. Anything else is refused with a 400.
 *         schema:
 *           $ref: '#/components/schemas/ListAge'
 *           default: all
 *       - $ref: '#/components/parameters/ListPage'
 *       - in: query
 *         name: pageSize
 *         required: false
 *         description: Tokens a page. Any other size is refused with a 400.
 *         schema:
 *           $ref: '#/components/schemas/PageSize'
 *           default: 50
 *     responses:
 *       200:
 *         description: One page of tokens on their curve, with both totals
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExplorePageResponse'
 *       400:
 *         description: A sort or age outside its set, a page that is not a whole number from 1 to 100000, or a page size outside 6, 10, 20, 24 and 50
 *       429:
 *         description: Rate limited, keyed by IP, on a budget counted apart from the creator routes
 *       503:
 *         description: INDEXER_UNAVAILABLE when the indexer's database did not answer, or INDEXER_BUSY with Retry-After 1 when every connection to it was taken. Both are worth retrying.
 */
router.get("/tokens/explore", marketLimiter, getExplore);

/**
 * @openapi
 * /api/v1/market/tokens/search:
 *   get:
 *     tags: [Market]
 *     operationId: searchTokens
 *     summary: Search every token by name, ticker or full address
 *     description: >
 *       Every token, graduated or still on its curve. Each says which in graduated.
 *       Read from the indexer, which runs a few seconds behind the chain. Public: no
 *       credential is needed.
 *
 *
 *       q is trimmed, then may be up to 64 characters. A full 42 character address
 *       matches that token alone, in any letter case. A partial address matches no
 *       address. Any other q matches a name or ticker containing it, ignoring case.
 *       % and _ in q match themselves. An empty q lists every token.
 *
 *
 *       relevance ranks an exact ticker first, then a name or ticker starting with q,
 *       then one containing it. A full address matches one token, so it is first by
 *       being the only one. Market cap, largest first, breaks ties within a rank. With
 *       an empty q, relevance is market cap. market-cap orders largest first. newest
 *       and oldest order by launch time. volume orders by the volume traded inside the
 *       age window, largest first, and leaves out every token with none there. Market
 *       caps and volumes are compared in dollars while dollar rates are on, a token
 *       with no rate last, and raw across quote assets while they are off. Every order
 *       ends on the token address, so a token keeps its page between polls.
 *
 *
 *       age narrows the results to a window ending now, as it does on the Explore
 *       list. Under relevance, market-cap, newest and oldest it keeps tokens launched
 *       inside it. Under volume it is the window the volume is summed over: the
 *       indexer's hourly volume over the last 24 or 168 hours, whole hours only, or
 *       the all time volume under all.
 *
 *
 *       quote keeps the tokens quoted in one asset, sent in any letter case. The zero
 *       address is native ETH. GET /api/v1/market/quote-assets lists the assets in
 *       use. An address no token uses answers 200 with no tokens.
 *
 *
 *       marketCap is a raw integer string in the token's quote asset, in its decimals.
 *       Under volume alone each token also carries volume, the same way. logo is
 *       exactly what the creator set: an ipfs:// link, an https:// link, or empty. No
 *       FDV is served.
 *
 *
 *       total is every token matching. A page past the end answers 200 with no tokens
 *       and the total, so a pager can still be drawn.
 *
 *
 *       The backend holds each page for five seconds, keyed with q trimmed and
 *       lowercased and quote lowercased, so each spelling of one search shares it. It
 *       never holds a 503, so the next request asks again. A success carries
 *       `Cache-Control: public, max-age=5`, so a browser answers a poll inside that
 *       window itself.
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         description: >
 *           A name, a ticker or a full token address. Trimmed, then at most 64
 *           characters, with no control characters. Empty lists every token.
 *         schema:
 *           type: string
 *           default: ""
 *           examples: ["neo"]
 *       - in: query
 *         name: sort
 *         required: false
 *         description: The order. Anything else is refused with a 400.
 *         schema:
 *           $ref: '#/components/schemas/SearchSort'
 *           default: relevance
 *       - in: query
 *         name: age
 *         required: false
 *         description: How far back the results reach. Anything else is refused with a 400.
 *         schema:
 *           $ref: '#/components/schemas/ListAge'
 *           default: all
 *       - in: query
 *         name: quote
 *         required: false
 *         description: >
 *           A quote asset address, in any letter case. Leave it out for every quote
 *           asset. Anything but a full address is refused with a 400.
 *         schema:
 *           type: string
 *           pattern: "^0x[0-9a-fA-F]{40}$"
 *           examples: ["0x0000000000000000000000000000000000000000"]
 *       - $ref: '#/components/parameters/ListPage'
 *       - in: query
 *         name: pageSize
 *         required: false
 *         description: Tokens a page. Any other size is refused with a 400.
 *         schema:
 *           $ref: '#/components/schemas/PageSize'
 *           default: 24
 *     responses:
 *       200:
 *         description: One page of matching tokens, with the total
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SearchPageResponse'
 *       400:
 *         description: A q past 64 characters or holding a control character, a sort or age outside its set, a quote that is not a full address, a page that is not a whole number from 1 to 100000, or a page size outside 6, 10, 20, 24 and 50
 *       429:
 *         description: Rate limited, keyed by IP, on a budget counted apart from the creator routes
 *       503:
 *         description: INDEXER_UNAVAILABLE when the indexer's database did not answer, or INDEXER_BUSY with Retry-After 1 when every connection to it was taken. Both are worth retrying.
 */
router.get("/tokens/search", marketLimiter, getSearch);

/**
 * @openapi
 * /api/v1/market/creators/{creator}/tokens:
 *   get:
 *     tags: [Market]
 *     operationId: listCreatorTokens
 *     summary: List the tokens one wallet launched, newest first
 *     description: >
 *       Every token the wallet launched, graduated or still on its curve. Each says
 *       which in graduated. Read from the indexer, which runs a few seconds behind the
 *       chain. Public: no credential is needed.
 *
 *
 *       The creator is the wallet the launchpad records as the token's deployer, the
 *       same wallet the agent routes let act on it. It is never the creator fee
 *       recipient.
 *
 *
 *       graduated is true once the token's Uniswap pool has opened. A token whose
 *       curve has closed but whose pool has not opened yet, and a token whose
 *       graduation the launchpad rescued, both read false.
 *
 *
 *       Newest launch first, and tokens launched in the same second by token address,
 *       so a token keeps its page between polls.
 *
 *
 *       marketCap is a raw integer string in the token's quote asset, in its decimals.
 *       logo is exactly what the creator set: an ipfs:// link, an https:// link, or
 *       empty. No FDV is served.
 *
 *
 *       total is every token the wallet launched. A wallet that launched none answers
 *       200 with no tokens and a total of 0. A page past the end answers 200 with no
 *       tokens and the total, so a pager can still be drawn.
 *
 *
 *       The backend holds each page for five seconds, keyed with the address
 *       lowercased, so each spelling of one wallet shares it. It never holds a 503, so
 *       the next request asks again. A success carries
 *       `Cache-Control: public, max-age=5`, so a browser answers a poll inside that
 *       window itself.
 *     parameters:
 *       - in: path
 *         name: creator
 *         required: true
 *         description: >
 *           The wallet address, in any letter case. Its capitals are not checked
 *           against a checksum. Anything but a full address is refused with a 400.
 *         schema:
 *           type: string
 *           pattern: "^0x[0-9a-fA-F]{40}$"
 *           examples: ["0xA0Cf798816D4b9b9866b5330EEa46a18382f251e"]
 *       - $ref: '#/components/parameters/ListPage'
 *       - in: query
 *         name: pageSize
 *         required: false
 *         description: Tokens a page. Any other size is refused with a 400.
 *         schema:
 *           $ref: '#/components/schemas/PageSize'
 *           default: 24
 *     responses:
 *       200:
 *         description: One page of the wallet's tokens, with the total
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreatorPageResponse'
 *       400:
 *         description: A creator that is not a full address, a page that is not a whole number from 1 to 100000, or a page size outside 6, 10, 20, 24 and 50
 *       429:
 *         description: Rate limited, keyed by IP, on the market budget, counted apart from the signed in routes
 *       503:
 *         description: INDEXER_UNAVAILABLE when the indexer's database did not answer, or INDEXER_BUSY with Retry-After 1 when every connection to it was taken. Both are worth retrying.
 */
router.get("/creators/:creator/tokens", marketLimiter, getCreatorTokens);

export default router;
