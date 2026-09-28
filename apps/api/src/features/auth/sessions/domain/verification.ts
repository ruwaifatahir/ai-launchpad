import { getAddress } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { env } from "@/config/env";
import { ApiError } from "@/shared";
import { publicClient } from "@/lib/chain/client";
import { mintCredential } from "@/lib/credential";
import { logger } from "@/lib/logger";
import { takeNonce } from "@/features/auth/sessions/sessions.storage";
import type { VerifySessionInput } from "@/features/auth/sessions/domain/schema";

const REJECTION = "Could not verify that signed message.";

const panelDomains = new Set(env.PANEL_ORIGINS.map((origin) => new URL(origin).host));

export const openSession = async (input: VerifySessionInput) => {
  const message = parseSiweMessage(input.message);

  if (!message.address) throw ApiError.unauthorized(REJECTION);

  if (!message.domain || !panelDomains.has(message.domain))
    throw ApiError.unauthorized(REJECTION);

  if (message.chainId !== env.CHAIN_ID) throw ApiError.unauthorized(REJECTION);

  if (message.expirationTime && message.expirationTime <= new Date())
    throw ApiError.unauthorized(REJECTION);

  if (!message.nonce || !(await takeNonce(message.nonce)))
    throw ApiError.unauthorized(REJECTION);

  const signed = await publicClient.verifySiweMessage({
    message: input.message,
    signature: input.signature,
  });

  if (!signed) throw ApiError.unauthorized(REJECTION);

  const wallet = getAddress(message.address);

  const token = await mintCredential(wallet);

  logger.info("session opened", { wallet });

  return { token };
};
