import { randomBytes } from "node:crypto";
import type { Address } from "viem";
import { logger } from "@/lib/logger";
import { authorizeUrl } from "@/lib/x/oauth";
import { storeHandshake } from "@/features/core/connections/data-model/connections.storage";
import { requireCurrentConsent } from "@/features/core/connections/domain/consent";
import { requireGraduation } from "@/features/core/connections/domain/graduation";
import type { ConnectionParams } from "@/features/core/connections/domain/schema";

const HANDSHAKE_SECRET_BYTES = 32;

const secret = () => randomBytes(HANDSHAKE_SECRET_BYTES).toString("base64url");

export const startHandshake = async (params: ConnectionParams, wallet: Address) => {
  await requireGraduation(params.token);
  await requireCurrentConsent(params.token);

  const state = secret();
  const verifier = secret();

  await storeHandshake(state, { verifier, token: params.token, wallet });

  logger.info("handshake started", { token: params.token });

  return { url: authorizeUrl({ state, verifier }) };
};
