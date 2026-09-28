import type { Agent, Prisma } from "@prisma/client";
import prisma from "@/config/database";

export const upsertAgentByToken = (
  token: string,
  data: Omit<Prisma.AgentCreateInput, "token">,
) => prisma.agent.upsert({ where: { token }, create: { token, ...data }, update: data });

export const claimAgentSlot = (token: string, claimed: Date | null, next: Date) =>
  prisma.agent.updateMany({
    where: { token, nextPostAt: claimed },
    data: { nextPostAt: next },
  });

export const findAgentByToken = (token: string) =>
  prisma.agent.findUnique({ where: { token } });

export const findDueAgentsByNextPostAt = (now: Date) =>
  prisma.$queryRaw<Pick<Agent, "token" | "pace" | "nextPostAt">[]>`
    SELECT a."token", a."pace", a."nextPostAt"
    FROM "agents" a
    JOIN "connections" c ON c."token" = a."token"
    WHERE a."pausedAt" IS NULL
      AND a."stoppedAt" IS NULL
      AND a."name" IS NOT NULL
      AND a."personality" IS NOT NULL
      AND a."lore" IS NOT NULL
      AND a."style" IS NOT NULL
      AND c."confirmedAt" IS NOT NULL
      AND (a."nextPostAt" IS NULL OR a."nextPostAt" <= ${now})
  `;
