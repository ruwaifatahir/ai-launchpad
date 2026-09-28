import { logger } from "@/lib/logger";
import { exchangeCode, readAccount, revokeGrant } from "@/lib/x/oauth";
import {
  findConnectionByXUserId,
  upsertConnection,
} from "@/features/core/connections/data-model/connections.repo";
import { takeHandshake } from "@/features/core/connections/data-model/connections.storage";
import type { CallbackQuery } from "@/features/core/connections/domain/schema";

// How a return from X ended. Every one sends the creator back to the panel, so
// nothing here is thrown: a thrown failure would reach the creator's browser as a
// JSON body instead of a page they can use.
//
// The token is named whenever the handshake was found, so the panel knows which
// agent to show. An expired handshake names none, because AI Launchpad no longer holds
// one, and a state AI Launchpad never issued must not point the panel anywhere.
export type LinkReason = "declined" | "expired" | "taken" | "error";

export type LinkOutcome =
  | { connected: true; token: string }
  | { connected: false; reason: "expired" }
  | { connected: false; reason: Exclude<LinkReason, "expired">; token: string };

type Handshake = NonNullable<Awaited<ReturnType<typeof takeHandshake>>>;

// The one error X sends when the creator refuses on its screen. Any other value is
// X failing the attempt, and telling the creator they declined would be untrue.
const DECLINED = "access_denied";

const connect = async (handshake: Handshake, code: string): Promise<LinkOutcome> => {
  const grant = await exchangeCode({ code, verifier: handshake.verifier });
  const account = await readAccount(grant.accessCredential);
  const taken = await findConnectionByXUserId(account.id);

  const refuseTaken = async (): Promise<LinkOutcome> => {
    await revokeGrant(grant.refreshCredential).catch((cause: unknown) =>
      logger.warn("grant not handed back", { token: handshake.token, cause }),
    );

    logger.warn("x account already serves another token", {
      token: handshake.token,
      xUserId: account.id,
    });

    return { connected: false, reason: "taken", token: handshake.token };
  };

  if (taken && taken.token !== handshake.token) return refuseTaken();

  const connection = await upsertConnection(handshake.token, {
    xUserId: account.id,
    xUsername: account.handle,
    accessCredential: grant.accessCredential,
    refreshCredential: grant.refreshCredential,
    accessExpiresAt: grant.expiresAt,
    confirmedAt: null,
  });

  if (!connection) return refuseTaken();

  logger.info("x account connected", { token: handshake.token, xUserId: account.id });

  return { connected: true, token: handshake.token };
};

export const linkAccount = async (query: CallbackQuery): Promise<LinkOutcome> => {
  const handshake = await takeHandshake(query.state);

  if (!handshake) {
    logger.warn("handshake not held: expired, already finished or never issued");

    return { connected: false, reason: "expired" };
  }

  if (!("code" in query)) {
    logger.warn("handshake ended without a grant", {
      token: handshake.token,
      error: query.error,
    });

    const reason = query.error === DECLINED ? "declined" : "error";

    return { connected: false, reason, token: handshake.token };
  }

  // The handshake is spent by now, so an outage at X or in the database still
  // names the token: the creator lands on their own agent and starts again.
  try {
    return await connect(handshake, query.code);
  } catch (cause) {
    logger.error("x account not connected", { token: handshake.token, cause });

    return { connected: false, reason: "error", token: handshake.token };
  }
};
