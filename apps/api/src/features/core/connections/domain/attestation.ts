import { ApiError } from "@/shared";
import { logger } from "@/lib/logger";
import { updateConnectionAttestation } from "@/features/core/connections/data-model/connections.repo";
import { requireGraduation } from "@/features/core/connections/domain/graduation";
import type { ConnectionParams } from "@/features/core/connections/domain/schema";

export const recordAttestation = async (params: ConnectionParams) => {
  await requireGraduation(params.token);

  const confirmedAt = new Date();
  const { count } = await updateConnectionAttestation(params.token, confirmedAt);

  if (!count)
    throw ApiError.conflict(
      "Connect an X account before confirming the automated label and the link in the bio.",
      "CONNECTION_REQUIRED",
    );

  logger.info("attestation recorded", { token: params.token });

  return { token: params.token, confirmedAt };
};
