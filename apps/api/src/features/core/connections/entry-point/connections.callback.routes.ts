import { Router } from "express";
import { ipKey, makeLimiter } from "@/middleware/rate-limiter";
import { getCallback } from "@/features/core/connections/entry-point/connections.controller";

const router = Router();

// Lets the request through when Redis cannot be reached, so the creator still lands
// on the panel rather than a JSON body. Failing open costs nothing here: the
// handshake lives in the same Redis, so the return can finish nothing without it.
// Keyed by IP by name: no session reaches this route.
const callbackLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 10,
  prefix: "rl:callback:",
  key: ipKey,
  passOnStoreError: true,
});

/**
 * @openapi
 * /api/v1/core/connections/callback:
 *   get:
 *     tags: [Connections]
 *     operationId: handleConnectionCallback
 *     summary: Receive the creator back from X and create the connection
 *     description: >
 *       X sends the creator's browser here after they authorize. No client calls
 *       this route: it is registered with X in full, character for character, as one
 *       of the ten callback URLs X matches against. It is documented for the panel
 *       developer who has to know where the creator lands and what arrives with them.
 *
 *
 *       It carries no session and no credential, and is limited harder than the rest
 *       of the API and keyed by address, because the state is the only thing vouching
 *       for the request.
 *
 *
 *       The token connected is read from the attempt AI Launchpad stored, never from what
 *       the return carries. A token named in this request is dropped, so a forged
 *       return cannot attach an X account to a token its caller did not launch.
 *
 *
 *       Returning consumes the attempt. A second return carrying the same state finds
 *       nothing and writes nothing, and so does one carrying a state that has expired.
 *
 *
 *       The account's handle is read once here and stored as last known. AI Launchpad never
 *       refreshes it, so a creator who renames the account on X sees the old handle
 *       until they connect again.
 *
 *
 *       Connecting is not finishing. The creator still has to turn on X's automated
 *       label and name a human account in the bio, then tell AI Launchpad they have. Until
 *       then the agent publishes nothing.
 *     parameters:
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 128
 *         description: The state AI Launchpad issued when the attempt started
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 512
 *         description: Sent by X when the creator authorized. Exchanged, never stored
 *       - in: query
 *         name: error
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 256
 *         description: >
 *           Sent by X instead of the code when the attempt ends without a grant.
 *           `access_denied` means the creator declined. Any other value is X failing
 *           the attempt
 *     responses:
 *       302:
 *         description: >
 *           Every outcome but the rate limit is a redirect, because a person's
 *           browser is on the other end. The creator is sent to
 *           `<first panel origin>/connect/x`, so the return target and the CORS
 *           allowlist cannot drift apart. The query carries `status`, `reason` on a
 *           failure, and `token` whenever the handshake was found. The token is
 *           public and read from the stored handshake, never from the request. The
 *           panel reads the real state through an authenticated route, so the URL
 *           is a hint.
 *
 *
 *           `status=success` means the account connected. `status=failure` comes
 *           with one reason. `declined`: the creator refused at X. `expired`: a
 *           state AI Launchpad is not holding, never issued, already used or older than
 *           ten minutes, and it names no token. `taken`: that X account already
 *           serves another token, enforced on the account's permanent identifier
 *           at X. The other token is never named and the grant AI Launchpad just
 *           obtained is handed back to X first. `error`: anything else, X failing
 *           the attempt, a return X did not shape, or an outage. Nothing is
 *           written on any failure.
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *             example: https://panel.example/connect/x?status=failure&reason=taken&token=0xa0cf798816d4b9b9866b5330eea46a18382f251e
 *       429:
 *         description: Rate limited, keyed by address because there is no session here
 */
router.get("/connections/callback", callbackLimiter, getCallback);

export default router;
