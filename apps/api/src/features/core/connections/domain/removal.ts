import { ApiError } from "@/shared";
import { logger } from "@/lib/logger";
import { revokeGrant } from "@/lib/x/oauth";
import {
  deleteConnectionByToken,
  findRefreshCredentialByToken,
} from "@/features/core/connections/data-model/connections.repo";
import type { ConnectionParams } from "@/features/core/connections/domain/schema";

export const disconnectAccount = async (params: ConnectionParams) => {
  const refreshCredential = await findRefreshCredentialByToken(params.token);

  if (!refreshCredential)
    throw ApiError.notFound(
      "There is no X account connected to this token.",
      "CONNECTION_NOT_FOUND",
    );

  await revokeGrant(refreshCredential).catch((cause: unknown) =>
    logger.warn("grant not handed back", { token: params.token, cause }),
  );

  await deleteConnectionByToken(params.token);

  logger.info("x account disconnected", { token: params.token });

  return { token: params.token };
};
