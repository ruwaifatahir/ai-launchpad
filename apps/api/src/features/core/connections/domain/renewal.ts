import type { Address } from "viem";
import { logger } from "@/lib/logger";
import { XGrantGoneError, XMisconfiguredError, renewGrant } from "@/lib/x/oauth";
import { XUnreachableError } from "@/lib/x/transport";
import {
  deleteConnectionByToken,
  findCredentialsByToken,
  updateConnectionCredentials,
} from "@/features/core/connections/data-model/connections.repo";
import {
  releaseRenewalLock,
  takeRenewalLock,
} from "@/features/core/connections/data-model/connections.storage";

const RENEWAL_LEAD_MS = 5 * 60 * 1000;

const live = (expiresAt: Date) => expiresAt.getTime() - Date.now() > RENEWAL_LEAD_MS;

export const readLiveCredential = async (token: Address) => {
  const connection = await findCredentialsByToken(token);

  if (!connection) return null;

  if (live(connection.accessExpiresAt)) return connection.accessCredential;

  if (!(await takeRenewalLock(token))) {
    logger.warn("renewal already running", { token });

    return null;
  }

  try {
    const current = await findCredentialsByToken(token);

    if (!current) return null;

    if (live(current.accessExpiresAt)) return current.accessCredential;

    const grant = await renewGrant(current.refreshCredential);

    await updateConnectionCredentials(token, {
      accessCredential: grant.accessCredential,
      refreshCredential: grant.refreshCredential,
      accessExpiresAt: grant.expiresAt,
    });

    logger.info("connection renewed", { token });

    return grant.accessCredential;
  } catch (cause) {
    if (cause instanceof XGrantGoneError) {
      await deleteConnectionByToken(token);

      logger.warn("connection ended at x", { token });

      return null;
    }

    if (cause instanceof XMisconfiguredError) {
      logger.error("x rejected the app's own credentials", { token, cause });

      return null;
    }

    if (cause instanceof XUnreachableError) {
      logger.warn("renewal skipped, x could not be reached", { token, cause });

      return null;
    }

    throw cause;
  } finally {
    await releaseRenewalLock(token);
  }
};
