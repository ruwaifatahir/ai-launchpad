import { findConnectionByToken } from "@/features/core/connections/data-model/connections.repo";
import { readConsentState } from "@/features/core/connections/domain/consent";
import { requireGraduation } from "@/features/core/connections/domain/graduation";
import type { ConnectionParams } from "@/features/core/connections/domain/schema";

const outstandingGate = (
  current: boolean,
  connection: { confirmedAt: Date | null } | null,
) => {
  if (!current) return "consent";
  if (!connection) return "authorization";
  if (!connection.confirmedAt) return "attestation";

  return null;
};

export const readConnection = async (params: ConnectionParams) => {
  await requireGraduation(params.token);

  const [consent, connection] = await Promise.all([
    readConsentState(params.token),
    findConnectionByToken(params.token),
  ]);

  return {
    token: params.token,
    xUsername: connection?.xUsername ?? null,
    confirmedAt: connection?.confirmedAt ?? null,
    outstandingGate: outstandingGate(consent.current, connection),
    disconnected: consent.agreed && connection === null,
  };
};
