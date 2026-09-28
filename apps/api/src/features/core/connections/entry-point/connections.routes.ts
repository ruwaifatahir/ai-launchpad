import { Router } from "express";
import { limiter } from "@/middleware/rate-limiter";
import { session } from "@/middleware/session";
import { tokenOwner } from "@/middleware/token-owner";
import {
  deleteConnection,
  getConnection,
  getConsent,
  postAuthorization,
  postConsent,
  putAttestation,
} from "@/features/core/connections/entry-point/connections.controller";

const router = Router();

/**
 * @openapi
 * /api/v1/core/connections/{token}/consent:
 *   post:
 *     tags: [Connections]
 *     operationId: createConsent
 *     summary: Agree to the list of automated actions the agent will take
 *     description: >
 *       X requires the account owner's express written agreement to every
 *       automated action before an app acts through their account, and says
 *       outright that authorizing through OAuth is not that agreement. So this is
 *       the first of the three steps that connect an X account, and it comes
 *       before the creator is ever sent to X.
 *
 *
 *       Send the version the creator was shown. A version that is not the current
 *       one is a 409 and nothing is written, so a creator with a stale panel open
 *       never records agreement to wording nobody is showing. Read the agreement
 *       again and send the version that read returns.
 *
 *
 *       A version's text is never edited. A change is a new version, so the stored
 *       number is a faithful pointer to the exact wording and AI Launchpad keeps no copy
 *       of the text. Only a material change bumps the version, because a bump
 *       silences every agent until each creator returns and agrees again.
 *
 *
 *       Agreeing is append only. Agreeing again records a second agreement and
 *       overwrites nothing, and no route updates or deletes one. That is what keeps
 *       "who authorized this account, and to what" answerable after the connection
 *       is gone, because an agent's posts stay on X after a disconnect.
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
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       201:
 *         description: >
 *           What the write recorded: the token, the version agreed to and the time.
 *           It leaves out the wallet that agreed, which is the caller's own and
 *           already known to them, and the text, which the read owns.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConsentRecordResponse'
 *       400:
 *         description: >
 *           A body with no version, a version that is not a whole number above
 *           zero, an unknown field, or a token that is not an address
 *       401:
 *         description: No credential, a tampered one, or one older than seven days
 *       403:
 *         description: A token launched by another wallet
 *       404:
 *         description: A token the launchpad does not know
 *       409:
 *         description: >
 *           A token that has not graduated, or a version that is not the current
 *           one. Nothing was written either way.
 *       429:
 *         description: Rate limited, keyed by the session wallet
 *       503:
 *         description: >
 *           The chain could not be read for the ownership check, or the indexer for the
 *           graduation time. AI Launchpad refuses rather than let an ungraduated token
 *           through on a failed read. A busy indexer answers INDEXER_BUSY
 *           with Retry-After 1.
 */
router.post(
  "/connections/:token/consent",
  session,
  limiter,
  tokenOwner("token"),
  postConsent,
);

/**
 * @openapi
 * /api/v1/core/connections/{token}/consent:
 *   get:
 *     tags: [Connections]
 *     operationId: getConsent
 *     summary: Read the agreement the creator is asked to agree to
 *     description: >
 *       The backend owns this text and serves it. The panel renders what it is
 *       told and authors none of it, because a panel deploy would otherwise be
 *       able to change what creators are agreeing to.
 *
 *
 *       The sections are ordered and each carries a heading and its points. Render
 *       them in the order they arrive. A new section, a new point or a new version
 *       needs no panel release.
 *
 *
 *       The text names what the agent does, what it never does, and the two steps
 *       the creator takes by hand on X. It also says that the permission X asks for
 *       covers more than the agent uses and that the agent reads nothing, because
 *       the creator meets X's own wording minutes later and an understatement here
 *       costs exactly the trust this step exists to build.
 *
 *
 *       Send the version this returns back when the creator agrees. Reading records
 *       nothing.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *     responses:
 *       200:
 *         description: >
 *           The current version, the title and the sections. It says nothing about
 *           whether this creator has already agreed, which the connection read owns.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConsentTextResponse'
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
 *           A token that has not graduated. Connecting an X account waits for
 *           graduation, so the creator is not asked to agree to anything before
 *           there is something to publish about.
 *       429:
 *         description: Rate limited, keyed by the session wallet
 *       503:
 *         description: >
 *           The chain could not be read for the ownership check, or the indexer for the
 *           graduation time. AI Launchpad refuses rather than let an ungraduated token
 *           through on a failed read. A busy indexer answers INDEXER_BUSY
 *           with Retry-After 1.
 */
router.get(
  "/connections/:token/consent",
  session,
  limiter,
  tokenOwner("token"),
  getConsent,
);

/**
 * @openapi
 * /api/v1/core/connections/{token}/authorization:
 *   post:
 *     tags: [Connections]
 *     operationId: createAuthorization
 *     summary: Start connecting an X account and read back the URL to send the creator to
 *     description: >
 *       This answers with a URL and never redirects. A browser navigation carries
 *       no credential, so an authenticated route cannot send the creator anywhere.
 *       Navigate the browser to the URL this returns, and X asks for the permission
 *       in its own words on its own screen.
 *
 *
 *       Agreeing to the list of automated actions comes first. X says outright that
 *       authorizing through OAuth is not by itself consent to take automated actions
 *       through an account, so a creator who has agreed to nothing, or whose latest
 *       agreement is below the current version, is refused here before AI Launchpad asks X
 *       for anything. Read the agreement, agree to the version it returns, then start
 *       again.
 *
 *
 *       An attempt lives for ten minutes. Ten rather than five, because a creator who
 *       has to sign in to X first needs the time, and an abandoned attempt expires and
 *       leaves nothing behind. Starting again costs nothing and hands back a new URL.
 *
 *
 *       Each URL finishes one attempt. Returning from X consumes it, so a second return
 *       carrying the same state finds nothing and writes nothing.
 *
 *
 *       The token is recorded with the attempt and read from there when the creator
 *       returns, never from what the return carries. That is what stops a forged return
 *       attaching an X account to a token its caller did not launch.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *     responses:
 *       201:
 *         description: >
 *           The URL to navigate the browser to, and nothing else. The state and the
 *           verifier this attempt rests on stay with AI Launchpad, because either one is
 *           enough to finish the attempt.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthorizationUrlResponse'
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
 *           A token that has not graduated, a creator who has agreed to nothing, or an
 *           agreement below the current version. Nothing was written and X was never
 *           asked.
 *       429:
 *         description: Rate limited, keyed by the session wallet
 *       503:
 *         description: >
 *           The chain could not be read for the ownership check, or the indexer for the
 *           graduation time. AI Launchpad refuses rather than let an ungraduated token
 *           through on a failed read. A busy indexer answers INDEXER_BUSY
 *           with Retry-After 1.
 */
router.post(
  "/connections/:token/authorization",
  session,
  limiter,
  tokenOwner("token"),
  postAuthorization,
);

/**
 * @openapi
 * /api/v1/core/connections/{token}/attestation:
 *   put:
 *     tags: [Connections]
 *     operationId: confirmAttestation
 *     summary: Confirm the automated label and the link in the bio
 *     description: >
 *       The last of the three steps that connect an X account, and the only one
 *       the creator performs outside AI Launchpad. X requires the account owner to turn
 *       on the automated label and to name a human account in the bio. No API sets
 *       either one and no API reads either one back, so AI Launchpad can neither do it
 *       nor check it, and both steps are the creator's.
 *
 *
 *       AI Launchpad runs no check against X for either step and takes the creator's
 *       word, because being blocked by a check X gives nobody a way to run is worse
 *       than trusting the creator. Say so plainly wherever this is offered, so the
 *       two steps are understood as theirs.
 *
 *
 *       Both are confirmed in one action, so finishing is one step rather than two,
 *       and the request carries no body. Until this succeeds the agent publishes
 *       nothing, so it never posts as an undeclared bot.
 *
 *
 *       Confirming again succeeds and records the creator's word again. Connecting
 *       an X account again clears it, because their word was about the account that
 *       was connected then.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *     responses:
 *       200:
 *         description: >
 *           The token and the time the confirmation was recorded. It leaves out the
 *           account and the outstanding step, which the connection read owns.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AttestationResponse'
 *       400:
 *         description: >
 *           A token that is not an address, or a body carrying any field.
 *           Confirming is one action and carries nothing.
 *       401:
 *         description: No credential, a tampered one, or one older than seven days
 *       403:
 *         description: A token launched by another wallet
 *       404:
 *         description: A token the launchpad does not know
 *       409:
 *         description: >
 *           A token that has not graduated, or one with no X account connected.
 *           There is nothing to confirm about an account that is not there.
 *       429:
 *         description: Rate limited, keyed by the session wallet
 *       503:
 *         description: >
 *           The chain could not be read for the ownership check, or the indexer for the
 *           graduation time. AI Launchpad refuses rather than let an ungraduated token
 *           through on a failed read. A busy indexer answers INDEXER_BUSY
 *           with Retry-After 1.
 */
router.put(
  "/connections/:token/attestation",
  session,
  limiter,
  tokenOwner("token"),
  putAttestation,
);

/**
 * @openapi
 * /api/v1/core/connections/{token}:
 *   get:
 *     tags: [Connections]
 *     operationId: getConnection
 *     summary: Read the X connection that belongs to a token
 *     description: >
 *       This is its own route rather than fields on the agent read. The agent read
 *       is a fixed projection whose contract explains every field it deliberately
 *       omits, and folding a second feature into it would make one response the
 *       union of two. One extra call is the cheaper price.
 *
 *
 *       It answers three questions.
 *
 *
 *       Which X account is connected. xUsername is the handle as it was at the
 *       moment the account connected, and AI Launchpad never refreshes it, so a creator
 *       who renames the account on X sees the old handle until they connect again.
 *       Label it as last known wherever it is shown. It is null when there is no
 *       connection.
 *
 *
 *       Which step is outstanding. outstandingGate names the one step left, so a
 *       creator is shown what to do next rather than guessing why their agent is
 *       silent. "consent" means the list of automated actions has not been agreed
 *       to, or the agreement is below the current version, which is also what a
 *       creator sees when a version bump silences their agent. "authorization"
 *       means no X account is connected. "attestation" means an account is
 *       connected and the automated label and the bio link have not been confirmed.
 *       Null means all three are done and nothing here is stopping the agent. Drive
 *       the route of the same name to clear the one it reports.
 *
 *
 *       Whether a connection ended. disconnected is true for a token that agreed to
 *       the list and holds no connection now, which is what tells "connect X" from
 *       "connect X again". A creator who agreed and then walked away from X's own
 *       screen reads the same way, because AI Launchpad stores nothing a deletion could
 *       destroy to tell the two apart.
 *
 *
 *       No credential appears here or in any other response.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *     responses:
 *       200:
 *         description: >
 *           The last known handle, the time the creator confirmed the two manual
 *           steps, the outstanding step and whether a connection ended. It omits
 *           the account's identifier at X, the row's own times and both
 *           credentials, which no client has a use for.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConnectionResponse'
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
 *           A token that has not graduated. Connecting an X account waits for
 *           graduation, so there is no connection to report before then.
 *       429:
 *         description: Rate limited, keyed by the session wallet
 *       503:
 *         description: >
 *           The chain could not be read for the ownership check, or the indexer for the
 *           graduation time. AI Launchpad refuses rather than let an ungraduated token
 *           through on a failed read. A busy indexer answers INDEXER_BUSY
 *           with Retry-After 1.
 */
router.get("/connections/:token", session, limiter, tokenOwner("token"), getConnection);

/**
 * @openapi
 * /api/v1/core/connections/{token}:
 *   delete:
 *     tags: [Connections]
 *     operationId: deleteConnection
 *     summary: Take the agent off the X account
 *     description: >
 *       Disconnecting holds at once. The connection is deleted, and the absence of
 *       a connection is what disconnected means, so nothing publishes after this
 *       answers.
 *
 *
 *       AI Launchpad hands the refresh credential back to X first, so a connection
 *       AI Launchpad has forgotten does not sit in the creator's connected apps at X as a
 *       permission nobody holds credentials for. That call is best effort. X
 *       documents no success response for it, so AI Launchpad cannot check the answer and
 *       will not hold a creator connected waiting on one. A revoke that fails or
 *       never answers is logged and the disconnect still succeeds.
 *
 *
 *       The agent is neither read nor written. The persona, the topics, the pace,
 *       the pause and the admin stop are exactly as they were, so connecting again
 *       is not rewriting the character.
 *
 *
 *       The agreements survive too, because the record of what was authorized has
 *       to outlive the connection: an agent's posts stay on X after a disconnect. A
 *       token with agreements and no connection is one that was connected and is
 *       not now, which is how the panel tells connecting from connecting again.
 *
 *
 *       Once the connection is gone the X account is free to connect to another
 *       token, and the creator keeps posting to it by hand either way.
 *
 *
 *       Graduation is not checked here, so this route carries no 409. Graduation
 *       never reverses, so a connected agent is a graduated one by construction.
 *
 *
 *       A creator may instead revoke at X, without visiting AI Launchpad. X tells AI Launchpad
 *       nothing, so the connection stands here until the credentials next fail.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/TokenAddress'
 *     responses:
 *       200:
 *         description: >
 *           The token that was disconnected, and nothing else. There is no account
 *           left to name and no state left to report. A second disconnect that
 *           arrives while the first is still revoking answers this too, because a
 *           row that is already gone is the outcome either way.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DisconnectionResponse'
 *       400:
 *         description: A token that is not an address
 *       401:
 *         description: No credential, a tampered one, or one older than seven days
 *       403:
 *         description: A token launched by another wallet
 *       404:
 *         description: >
 *           A token the launchpad does not know, or a token with no X account
 *           connected. Nothing was revoked either way.
 *       429:
 *         description: Rate limited, keyed by the session wallet
 *       503:
 *         description: >
 *           The chain could not be read for the ownership check. Graduation is not
 *           read here.
 */
router.delete(
  "/connections/:token",
  session,
  limiter,
  tokenOwner("token"),
  deleteConnection,
);

export default router;
