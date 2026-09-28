import { Router } from "express";
import { limiter, makeLimiter } from "@/middleware/rate-limiter";
import { session } from "@/middleware/session";
import {
  getCurrentSession,
  getNonce,
  postSession,
} from "@/features/auth/sessions/entry-point/sessions.controller";

const router = Router();

const nonceLimiter = makeLimiter({ windowMs: 60 * 1000, max: 10, prefix: "rl:nonce:" });

/**
 * @openapi
 * /api/v1/auth/sessions/nonce:
 *   get:
 *     tags: [Auth]
 *     operationId: getSessionNonce
 *     summary: Issue a nonce to sign
 *     description: >
 *       Open, because a caller has no session yet. The nonce goes into the SIWE
 *       message the wallet signs. It lives five minutes and is accepted once, so a
 *       captured signature cannot be replayed. Limited harder than the rest of the
 *       API, because this is the one unauthenticated route that writes.
 *     responses:
 *       200:
 *         description: The nonce, and nothing else
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NonceResponse'
 *       429:
 *         description: Rate limited, keyed by IP because there is no session yet
 */
router.get("/sessions/nonce", nonceLimiter, getNonce);

/**
 * @openapi
 * /api/v1/auth/sessions:
 *   post:
 *     tags: [Auth]
 *     operationId: createSession
 *     summary: Turn a signed message into a session
 *     description: >
 *       Send an EIP-4361 message and its signature. The backend accepts it only when
 *       the signature matches the address in the message, the nonce was issued here
 *       and is unused, the domain is a configured panel origin, the chain id is the
 *       configured chain, and the message has not expired. Every failure is the same
 *       401, so a caller cannot tell which check failed. The nonce is spent whether
 *       or not the rest passes. The reply carries the credential alone: it is a
 *       bearer token whose subject is the signing wallet, it lasts seven days, and
 *       nothing can end it earlier.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message, signature]
 *             properties:
 *               message:
 *                 type: string
 *                 maxLength: 4000
 *               signature:
 *                 type: string
 *                 pattern: '^0x([0-9a-fA-F]{2})+$'
 *                 maxLength: 4000
 *     responses:
 *       201:
 *         description: The session credential
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SessionCredentialResponse'
 *       400:
 *         description: A missing field, a signature that is not hex, or an unknown field
 *       401:
 *         description: Any check failed, with no hint as to which
 *       429:
 *         description: Rate limited
 */
router.post("/sessions", limiter, postSession);

/**
 * @openapi
 * /api/v1/auth/sessions/current:
 *   get:
 *     tags: [Auth]
 *     operationId: getCurrentSession
 *     summary: Read the wallet in the current session
 *     description: >
 *       Send the credential as a bearer token in the Authorization header. The
 *       backend never reads a session from a cookie. The reply is the wallet address
 *       alone, because that is the whole of what a session holds. Naming a wallet is
 *       not permission to act on a token: every route that touches one checks the
 *       token's creator on chain as well.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The wallet address in the session
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SessionWalletResponse'
 *       401:
 *         description: No credential, a tampered one, or one older than seven days
 *       429:
 *         description: Rate limited, keyed by the session wallet
 */
router.get("/sessions/current", session, limiter, getCurrentSession);

export default router;
