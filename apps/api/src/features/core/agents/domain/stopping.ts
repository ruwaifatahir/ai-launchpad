import { logger } from "@/lib/logger";
import { findAgentByToken, upsertAgentByToken } from "@/features/core/agents/agents.repo";
import type { AgentParams } from "@/features/core/agents/domain/schema";

export const stopAgent = async (params: AgentParams) => {
  const existing = await findAgentByToken(params.token);

  const agent = await upsertAgentByToken(params.token, {
    stoppedAt: existing?.stoppedAt ?? new Date(),
  });

  logger.info("agent stopped", { token: agent.token, stoppedAt: agent.stoppedAt });

  return { token: agent.token, stoppedAt: agent.stoppedAt, updatedAt: agent.updatedAt };
};
