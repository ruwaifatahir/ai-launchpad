import { logger } from "@/lib/logger";
import { upsertAgentByToken } from "@/features/core/agents/agents.repo";
import type { AgentParams, ReviseAgentInput } from "@/features/core/agents/domain/schema";

export const reviseAgent = async (params: AgentParams, input: ReviseAgentInput) => {
  const agent = await upsertAgentByToken(params.token, input);

  logger.info("agent revised", { token: agent.token, fields: Object.keys(input) });

  return {
    token: agent.token,
    name: agent.name,
    personality: agent.personality,
    lore: agent.lore,
    style: agent.style,
    topics: agent.topics,
    pace: agent.pace,
    updatedAt: agent.updatedAt,
  };
};
