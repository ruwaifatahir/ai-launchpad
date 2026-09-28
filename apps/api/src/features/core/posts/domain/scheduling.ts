import { logger } from "@/lib/logger";
import {
  claimAgentSlot,
  findDueAgentsByNextPostAt,
} from "@/features/core/agents/agents.repo";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const windowMs = (pace: number) => DAY_MS / pace;

const nextSlot = (from: Date, pace: number) => {
  const width = windowMs(pace);
  const midnight = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const window = Math.floor((from.getTime() - midnight) / width) + 1;
  const minute = Math.floor(Math.random() * (width / MINUTE_MS));

  return new Date(midnight + window * width + minute * MINUTE_MS);
};

const missed = (now: Date, nextPostAt: Date | null, pace: number) =>
  nextPostAt !== null && now.getTime() - nextPostAt.getTime() >= windowMs(pace);

export const claimDueSlots = async () => {
  const now = new Date();
  const agents = await findDueAgentsByNextPostAt(now);
  const claimed: string[] = [];

  for (const agent of agents) {
    const { count } = await claimAgentSlot(
      agent.token,
      agent.nextPostAt,
      nextSlot(now, agent.pace),
    );

    if (!count) continue;

    if (missed(now, agent.nextPostAt, agent.pace)) {
      logger.warn("slot missed, nothing published", { token: agent.token });

      continue;
    }

    claimed.push(agent.token);
  }

  return claimed;
};
