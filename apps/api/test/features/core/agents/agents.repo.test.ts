import { describe, expect, it } from "vitest";

import {
  claimAgentSlot,
  findAgentByToken,
  findDueAgentsByNextPostAt,
  upsertAgentByToken,
} from "@/features/core/agents/agents.repo";
import { prismaMock } from "@test/helpers/prisma.mock";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e";

const dueQuery = () =>
  (prismaMock.$queryRaw.mock.calls[0][0] as string[]).join("?").replace(/\s+/g, " ");

describe("agents.repo", () => {
  it("upsertAgentByToken writes through an upsert, so the creator's first write creates the lazy row instead of failing on a missing one", () => {
    upsertAgentByToken(token, { name: "Vector" });

    expect(prismaMock.agent.upsert).toHaveBeenCalledWith({
      where: { token },
      create: { token, name: "Vector" },
      update: { name: "Vector" },
    });
  });

  it("upsertAgentByToken sends only the supplied fields to the update, so a part the creator left out keeps what it already held", () => {
    upsertAgentByToken(token, { lore: null });

    expect(prismaMock.agent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { lore: null } }),
    );
  });

  it("claimAgentSlot updates only while the next post time still holds the value the tick read, so the worker that loses the race updates nothing", () => {
    const claimed = new Date("2026-05-01T09:00:00.000Z");
    const next = new Date("2026-05-01T14:37:00.000Z");

    claimAgentSlot(token, claimed, next);

    expect(prismaMock.agent.updateMany).toHaveBeenCalledWith({
      where: { token, nextPostAt: claimed },
      data: { nextPostAt: next },
    });
  });

  it("claimAgentSlot carries a null next post time into the condition, so an agent that has never been scheduled is claimed exactly once too", () => {
    claimAgentSlot(token, null, new Date("2026-05-01T14:37:00.000Z"));

    expect(prismaMock.agent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token, nextPostAt: null } }),
    );
  });

  it("findAgentByToken looks the row up by its token with findUnique, so a token with no row reads back null rather than throwing", () => {
    findAgentByToken(token);

    expect(prismaMock.agent.findUnique).toHaveBeenCalledWith({ where: { token } });
  });

  it("findDueAgentsByNextPostAt starts from agents that have a connection, which is what makes graduation true by construction and costs the tick no chain read", () => {
    findDueAgentsByNextPostAt(new Date("2026-05-01T09:20:00.000Z"));

    expect(dueQuery()).toContain('JOIN "connections" c ON c."token" = a."token"');
  });

  it("findDueAgentsByNextPostAt excludes a paused agent, a stopped agent, an incomplete persona and a connection without an attestation, so the tick claims no slot that was never going to publish", () => {
    findDueAgentsByNextPostAt(new Date("2026-05-01T09:20:00.000Z"));

    for (const filter of [
      'a."pausedAt" IS NULL',
      'a."stoppedAt" IS NULL',
      'a."name" IS NOT NULL',
      'a."personality" IS NOT NULL',
      'a."lore" IS NOT NULL',
      'a."style" IS NOT NULL',
      'c."confirmedAt" IS NOT NULL',
    ])
      expect(dueQuery()).toContain(filter);
  });

  it("findDueAgentsByNextPostAt treats a null next post time as due alongside one that has passed, so a creator who has just finished setup is swept up with everyone else", () => {
    const now = new Date("2026-05-01T09:20:00.000Z");

    findDueAgentsByNextPostAt(now);

    expect(dueQuery()).toContain('(a."nextPostAt" IS NULL OR a."nextPostAt" <= ?)');
    expect(prismaMock.$queryRaw).toHaveBeenCalledWith(expect.anything(), now);
  });

  it("findDueAgentsByNextPostAt leaves consent currency out of SQL, because the latest row per token is a read the connections feature owns", () => {
    findDueAgentsByNextPostAt(new Date("2026-05-01T09:20:00.000Z"));

    expect(dueQuery()).not.toContain("consents");
  });
});
