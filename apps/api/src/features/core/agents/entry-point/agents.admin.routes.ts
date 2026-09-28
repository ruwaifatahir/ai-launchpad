import { Router } from "express";
import { adminKey } from "@/middleware/admin-key";
import { limiter } from "@/middleware/rate-limiter";
import { putAgentStop } from "@/features/core/agents/entry-point/agents.controller";

const router = Router();

/**
 * @openapi
 * /api/v1/core/agents/{token}/admin/stop:
 *   put:
 *     tags: [Agents]
 *     operationId: stopAgent
 *     summary: Stop the agent that belongs to a token, as an AI Launchpad admin
 *     description: >
 *       Every agent posts through one shared AI Launchpad connection to X, and X allows
 *       no backup. One agent breaking X's rules puts every other agent's access at
 *       risk, so this is how AI Launchpad takes that agent off X.
 *
 *
 *       The credential is an admin API key, not a creator session. It travels in
 *       the X-Admin-Key header and never the authorization header, so no code path
 *       can confuse the two and no creator can ever reach this route.
 *
 *
 *       An agent is stopped whatever state it is in: running, paused or still
 *       locked, and this route never reads the chain, neither for graduation nor
 *       for who launched the token. Stopping an agent that is already stopped
 *       succeeds and keeps the time it was first stopped, because the stop
 *       happened once. It also creates the row when the creator has never written
 *       to this token, so an untouched agent can still be stopped.
 *
 *
 *       The stop holds against the creator. They keep editing the persona of a
 *       stopped agent, because the stop should not punish them twice over, but a
 *       resume is a 409 on their pause route. The stop time is never cleared and
 *       there is no route that undoes it. Nothing here touches the token, which
 *       trades either way, and nothing here records who stopped the agent or why.
 *     security:
 *       - adminKey: []
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *     responses:
 *       200:
 *         description: >
 *           What the write recorded: the stop time and updatedAt, because the new
 *           timestamp is the one fact the caller cannot derive. It is a deliberate
 *           subset of the read, which leaves out the persona, the topics, the
 *           pace, the pause and the graduation time, none of which this route can
 *           change. Read the agent for those.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AgentStopResponse'
 *       400:
 *         description: A token that is not an address
 *       401:
 *         description: >
 *           No admin key, a wrong one, or one sent in the authorization header
 *           rather than its own
 *       429:
 *         description: Rate limited
 */
router.put("/agents/:token/admin/stop", adminKey, limiter, putAgentStop);

export default router;
