import type { Address } from "viem";
import { findAgentByToken } from "@/features/core/agents/agents.repo";
import { hasCompletePersona } from "@/features/core/agents/domain/persona";
import { findConnectionByToken } from "@/features/core/connections/data-model/connections.repo";
import { readConsentState } from "@/features/core/connections/domain/consent";

export const readSilenceReason = async (token: Address, graduatedAt: Date | null) => {
  const [agent, connection, consent] = await Promise.all([
    findAgentByToken(token),
    findConnectionByToken(token),
    readConsentState(token),
  ]);

  if (agent?.stoppedAt) return "stopped";
  if (!graduatedAt) return "locked";
  if (agent?.pausedAt) return "paused";
  if (!hasCompletePersona(agent)) return "persona";
  if (!connection?.confirmedAt || !consent.current) return "connection";

  return null;
};
