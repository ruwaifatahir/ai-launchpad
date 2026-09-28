import { Router } from "express";
import { limiter } from "@/middleware/rate-limiter";
import { session } from "@/middleware/session";
import { tokenOwner } from "@/middleware/token-owner";
import {
  getAgent,
  patchAgent,
  putAgentPause,
} from "@/features/core/agents/entry-point/agents.controller";

const router = Router();

/**
 * @openapi
 * /api/v1/core/agents/{token}:
 *   patch:
 *     tags: [Agents]
 *     operationId: updateAgent
 *     summary: Write or edit the agent that belongs to a token
 *     description: >
 *       Partial. Send only what changes; at least one field is required and a body
 *       that changes nothing is a 400, so an empty edit is never mistaken for a
 *       successful one. A field left out is untouched. An unknown field is a 400
 *       rather than ignored, because a panel sending one has the wrong contract.
 *
 *
 *       This is also the route that creates the agent. No row exists until the
 *       creator first writes something, so the first call here creates it and every
 *       later call edits it. That stretches the usual meaning of a partial update,
 *       and it is stated here rather than left for the panel to discover.
 *
 *
 *       Every persona part is trimmed before it is stored, and a whitespace only
 *       part is a 400 rather than a stored blank. Send a part as null to clear it,
 *       which is how a creator deletes lore they regret rather than only replacing
 *       it. A persona counts as written only when the name, personality, lore and
 *       style are all present, so clearing any one of them drops the agent back to
 *       publishing nothing.
 *
 *
 *       Topics are set whole rather than appended to, so send the list you want and
 *       send an empty list to start them over. Pace is whole posts a day, held
 *       between 1 and 5 so the account is never flagged for volume.
 *
 *
 *       Every change applies to the next post, so nothing here waits for a cycle to
 *       end. Editing is allowed in every state, locked and paused and stopped alike:
 *       nothing publishes while any of those hold, so refusing an edit would protect
 *       nothing.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             additionalProperties: false
 *             properties:
 *               name:
 *                 type: [string, "null"]
 *                 maxLength: 40
 *               personality:
 *                 type: [string, "null"]
 *                 maxLength: 1000
 *               lore:
 *                 type: [string, "null"]
 *                 maxLength: 2000
 *               style:
 *                 type: [string, "null"]
 *                 maxLength: 500
 *               topics:
 *                 $ref: '#/components/schemas/Topics'
 *               pace:
 *                 $ref: '#/components/schemas/Pace'
 *     responses:
 *       200:
 *         description: >
 *           What the write recorded, and updatedAt because the new timestamp is the
 *           one fact the caller cannot derive. It is a deliberate subset of the read:
 *           it leaves out pausedAt, stoppedAt and graduatedAt, none of which this
 *           route can change. Read the agent for those.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AgentRevisionResponse'
 *       400:
 *         description: >
 *           The message names the field it rejected, or asks for at least one
 *           field when the body changes nothing.
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
router.patch("/agents/:token", session, limiter, tokenOwner("token"), patchAgent);

/**
 * @openapi
 * /api/v1/core/agents/{token}/pause:
 *   put:
 *     tags: [Agents]
 *     operationId: setAgentPause
 *     summary: Pause the agent that belongs to a token, or start it again
 *     description: >
 *       One route for both directions. Send paused true to silence the agent and
 *       paused false to start it again, so a pause is never a one way door.
 *
 *
 *       A pause takes hold at once. There is no last post on the way out and
 *       nothing waits for a posting cycle to end.
 *
 *
 *       Setting the pause to the state it already holds succeeds rather than
 *       erroring, so a double click is not a mistake. Pausing an agent that is
 *       already paused keeps the time it was first silenced, because that is when
 *       the creator silenced it.
 *
 *
 *       A paused agent keeps everything: its persona, its topics and its pace.
 *       This route writes the pause time and nothing else, and it creates the row
 *       when the creator has never written to this token, so an untouched agent
 *       can still be silenced. Neither direction touches the token, which trades
 *       either way.
 *
 *
 *       Resuming is the one direction that can be refused. An AI Launchpad admin's stop
 *       is not the creator's to reverse, so a resume against a stopped agent is a
 *       409 and nothing is written. Pausing a stopped agent still succeeds,
 *       because nothing publishes while the stop holds and refusing the pause
 *       would protect nothing. A locked agent pauses and resumes exactly like an
 *       unlocked one, and this route never reads the chain for graduation.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [paused]
 *             properties:
 *               paused:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: >
 *           What the write recorded: the pause time, null once the agent is
 *           running again, and updatedAt because the new timestamp is the one fact
 *           the caller cannot derive. It is a deliberate subset of the read, which
 *           leaves out the persona, the topics, the pace, the stop and the
 *           graduation time, none of which this route can change. Read the agent
 *           for those.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AgentPauseResponse'
 *       400:
 *         description: >
 *           A body that does not say which state it wants, a pause that is not a
 *           boolean, an unknown field, or a token that is not an address
 *       401:
 *         description: No credential, a tampered one, or one older than seven days
 *       403:
 *         description: A token launched by another wallet
 *       404:
 *         description: A token the launchpad does not know
 *       409:
 *         description: >
 *           A resume against an agent an AI Launchpad admin stopped. The creator cannot
 *           undo that decision, and nothing was written.
 *       429:
 *         description: Rate limited, keyed by the session wallet
 *       503:
 *         description: >
 *           The chain could not be read for the ownership check. AI Launchpad refuses
 *           rather than guess that the caller launched the token.
 */
router.put("/agents/:token/pause", session, limiter, tokenOwner("token"), putAgentPause);

/**
 * @openapi
 * /api/v1/core/agents/{token}:
 *   get:
 *     tags: [Agents]
 *     operationId: getAgent
 *     summary: Read the agent that belongs to a token
 *     description: >
 *       The agent is addressed by the token address, and there is no second
 *       identifier to hold. Only the creator the launchpad names may read it: a
 *       token launched by another wallet is a 403, and a token the launchpad does
 *       not know is a 404.
 *
 *
 *       Every token has an agent, so a token whose creator has never written
 *       anything answers with the empty persona, no topics and a pace of 1 rather
 *       than a 404. That is the same pace their first write would leave behind.
 *       Reading creates nothing.
 *
 *
 *       The reply carries the time behind each state rather than one state word.
 *       Null means it has not happened: pausedAt is when the creator silenced the agent,
 *       stoppedAt is when an AI Launchpad admin stopped it, and graduatedAt is the real
 *       time the token's Uniswap pool opened, read from the indexer, never the
 *       time AI Launchpad first looked. A null graduatedAt is a locked agent: the pool
 *       has not opened, or the indexer has not reached the token yet.
 *
 *
 *       Work the state out in this order, because the backend acts on the same
 *       one: stopped, then locked, then paused, then an incomplete persona, then
 *       no X connection, then running. A persona is complete only when the name,
 *       personality, lore and style are all present; anything less publishes
 *       nothing.
 *
 *
 *       The last two sit at the end because the first three are decisions somebody
 *       made and these two are steps the creator has not finished, and the persona
 *       precedes the connection because it is the one a creator can finish before
 *       graduating. An X account with credentials and no attestation counts as no
 *       connection here, and so does an agreement below the current consent
 *       version. This read says nothing about any of that: read the connection for
 *       which of the three steps is outstanding.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *     responses:
 *       200:
 *         description: >
 *           The persona, the topics, the pace and the three times. It omits the
 *           row's own createdAt and updatedAt, which describe when AI Launchpad first
 *           stored the agent rather than anything about the agent itself.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AgentResponse'
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
 *           The chain could not be read for the ownership check, or the indexer for the
 *           graduation time. AI Launchpad refuses rather than guess that a token has not
 *           graduated. A busy indexer answers INDEXER_BUSY with Retry-After 1.
 */
router.get("/agents/:token", session, limiter, tokenOwner("token"), getAgent);

export default router;
