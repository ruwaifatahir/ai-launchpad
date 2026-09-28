import { ApiError } from "@/shared";
import { logger } from "@/lib/logger";
import { findAgentByToken, upsertAgentByToken } from "@/features/core/agents/agents.repo";
import type {
  AgentParams,
  SetAgentPauseInput,
} from "@/features/core/agents/domain/schema";

export const setAgentPause = async (params: AgentParams, input: SetAgentPauseInput) => {
  const existing = await findAgentByToken(params.token);

  if (!input.paused && existing?.stoppedAt) {
    throw ApiError.conflict(
      "An AI Launchpad admin stopped this agent, so it cannot be started again.",
      "AGENT_STOPPED",
    );
  }

  const agent = await upsertAgentByToken(params.token, {
    pausedAt: input.paused ? (existing?.pausedAt ?? new Date()) : null,
  });

  logger.info("agent pause set", { token: agent.token, paused: input.paused });

  return { token: agent.token, pausedAt: agent.pausedAt, updatedAt: agent.updatedAt };
};
