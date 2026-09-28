import { readTokenGraduation } from "@/features/core/graduations/reading";
import { findAgentByToken } from "@/features/core/agents/agents.repo";
import type { AgentParams } from "@/features/core/agents/domain/schema";

const DEFAULT_PACE = 1;

export const readAgent = async (params: AgentParams) => {
  const [agent, graduatedAt] = await Promise.all([
    findAgentByToken(params.token),
    readTokenGraduation(params.token),
  ]);

  return {
    token: params.token,
    name: agent?.name ?? null,
    personality: agent?.personality ?? null,
    lore: agent?.lore ?? null,
    style: agent?.style ?? null,
    topics: agent?.topics ?? [],
    pace: agent?.pace ?? DEFAULT_PACE,
    pausedAt: agent?.pausedAt ?? null,
    stoppedAt: agent?.stoppedAt ?? null,
    graduatedAt,
  };
};
