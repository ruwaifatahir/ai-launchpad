import { Router } from "express";
import { limiter } from "@/middleware/rate-limiter";
import { session } from "@/middleware/session";
import { tokenOwner } from "@/middleware/token-owner";
import {
  getPreviewAllowance,
  postPreview,
} from "@/features/core/previews/entry-point/previews.controller";

const router = Router();

/**
 * @openapi
 * /api/v1/core/previews/{token}:
 *   post:
 *     tags: [Previews]
 *     operationId: createPreview
 *     summary: Write one post for the creator to read, and send it nowhere
 *     description: >
 *       A preview is one post the agent writes for its creator alone, so they can
 *       see what their persona produces before trusting it to a slot. It reaches no
 *       slot, no schedule and no X account, and it is not a post: nothing is stored,
 *       nothing is published, and the agent's posting history is untouched.
 *
 *
 *       There is no request body. The persona, the topics and the recent posts all
 *       come from what is already stored, because the point of a preview is to
 *       predict what the agent will do unattended. Anything sent in the body is
 *       ignored. To change what comes back, edit the agent and ask again.
 *
 *
 *       The preview reads exactly what the scheduler reads: the saved persona, the
 *       saved topics, and the last ten posts that were published or run dry. It
 *       never reads another preview and never becomes one of them, so taking twenty
 *       previews leaves the next real post exactly as it would have been. Two
 *       previews in a row can therefore come back similar, which is the cost of the
 *       agent having no memory of something nobody ever saw.
 *
 *
 *       Refused in three states, checked in this order: an AI Launchpad admin stopped the
 *       agent, the token has not graduated, or the persona is missing one of its
 *       four parts. A paused agent still previews, and so does one with no X
 *       account, because neither of those stops a preview that publishes nothing.
 *
 *
 *       Every agent gets twenty previews a UTC day. Only a preview that produced
 *       text spends one: a writer that refused, a writer that broke the rules a post
 *       is held to, and a writer that could not be reached all give the preview
 *       back. The allowance is returned on every reply so the panel can show what is
 *       left without asking for it, and it resets at midnight UTC.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *     responses:
 *       200:
 *         description: >
 *           The preview, or the reason there is none. Text carries the post and
 *           reason is null when the writer answered. Text is null and reason says
 *           why when it did not: refused means the model would not write this
 *           character at all, and unpublishable means it answered twice with
 *           something too long, or carrying a link or a mention, which a post may
 *           never do. Both are facts about the persona rather than failures, which
 *           is why neither is an error and neither spends a preview.
 *
 *
 *           Allowance is the whole day's number and remaining is what is left after
 *           this call. The reply carries no cost and no token counts: what the model
 *           charged is AI Launchpad's to know.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PreviewResponse'
 *       400:
 *         description: A token that is not an address
 *       401:
 *         description: No credential, a tampered one, or one older than seven days
 *       403:
 *         description: A token launched by another wallet
 *       404:
 *         description: A token the launchpad does not know
 *       409:
 *         description: >
 *           A stopped agent, a token whose pool has not opened, or a persona missing one of
 *           its four parts. The message names which, and nothing was spent.
 *       429:
 *         description: >
 *           Either the day's allowance is gone, in which case the message says so and
 *           it returns at midnight UTC, or the shared rate limiter refused the
 *           request, which is keyed by the session wallet and clears within the
 *           minute.
 *       503:
 *         description: >
 *           The writer could not be reached, or answered with nothing usable, or the
 *           chain could not be read for the ownership check, or the indexer for the
 *           graduation time. Nothing was spent, so the same request is worth
 *           repeating. A busy indexer answers INDEXER_BUSY with Retry-After 1.
 */
router.post("/previews/:token", session, limiter, tokenOwner("token"), postPreview);

/**
 * @openapi
 * /api/v1/core/previews/{token}/allowance:
 *   get:
 *     tags: [Previews]
 *     operationId: getPreviewAllowance
 *     summary: Read how many previews this agent has left today
 *     description: >
 *       What the panel loads before offering the button, so a creator arriving at
 *       the tuning screen sees what is left without spending one to find out.
 *
 *
 *       Reading creates nothing and spends nothing. An agent that has taken no
 *       preview today has no row, and answers with the full allowance rather than a
 *       404.
 *
 *
 *       This read applies none of the three refusals the write applies. A stopped
 *       agent, a locked one and an unwritten persona all report their full
 *       allowance, because the allowance is a fact about the day rather than a
 *       statement that a preview would succeed. Read the agent for the state.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *     responses:
 *       200:
 *         description: >
 *           The day's allowance, what is left of it, and when it resets. A deliberate
 *           subset of what the write returns, leaving out the text and the reason,
 *           neither of which a read can have.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PreviewAllowanceResponse'
 *       400:
 *         description: A token that is not an address
 *       401:
 *         description: No credential, a tampered one, or one older than seven days
 *       403:
 *         description: A token launched by another wallet
 *       404:
 *         description: A token the launchpad does not know
 *       429:
 *         description: Rate limited, keyed by the session wallet
 *       503:
 *         description: >
 *           The chain could not be read for the ownership check. AI Launchpad refuses
 *           rather than guess that the caller launched the token.
 */
router.get(
  "/previews/:token/allowance",
  session,
  limiter,
  tokenOwner("token"),
  getPreviewAllowance,
);

export default router;
