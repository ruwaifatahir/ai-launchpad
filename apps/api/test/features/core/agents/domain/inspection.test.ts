import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/agents/agents.repo", () => ({ findAgentByToken: vi.fn() }));
vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));

import { readTokenGraduation } from "@/features/core/graduations/reading";
import { findAgentByToken } from "@/features/core/agents/agents.repo";
import { readAgent } from "@/features/core/agents/domain/inspection";
import { prismaMock } from "@test/helpers/prisma.mock";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;
const graduatedAt = new Date("2026-03-01T12:00:00.000Z");

const written = {
  token,
  name: "Vector",
  personality: "Terse and certain",
  lore: "Born in a warehouse",
  style: "Short sentences",
  topics: ["the curve", "the stock"],
  pace: 4,
  nextPostAt: null,
  pausedAt: new Date("2026-04-01T00:00:00.000Z"),
  stoppedAt: null,
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
};

describe("readAgent", () => {
  beforeEach(() => {
    vi.mocked(findAgentByToken).mockResolvedValue(null);
    vi.mocked(readTokenGraduation).mockResolvedValue(null);
  });

  it("returns what the creator wrote: the four persona parts, the topics and the pace", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue(written);

    const agent = await readAgent({ token });

    expect(agent).toMatchObject({
      name: "Vector",
      personality: "Terse and certain",
      lore: "Born in a warehouse",
      style: "Short sentences",
      topics: ["the curve", "the stock"],
      pace: 4,
    });
  });

  it("answers a token the creator has never touched with the empty persona, because every token has an agent whether or not a row exists", async () => {
    const agent = await readAgent({ token });

    expect(agent).toMatchObject({
      name: null,
      personality: null,
      lore: null,
      style: null,
      topics: [],
    });
  });

  it("reports a pace of 1 for a token with no row, which is the same pace the first write would leave behind", async () => {
    expect((await readAgent({ token })).pace).toBe(1);
  });

  it("exposes the same keys whether or not a row exists, so the panel reads one shape", async () => {
    const empty = await readAgent({ token });

    vi.mocked(findAgentByToken).mockResolvedValue(written);
    const stored = await readAgent({ token });

    expect(Object.keys(stored)).toEqual(Object.keys(empty));
  });

  it("returns each state as the time it happened and null for one that has not, rather than a word the panel would have to trust", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue(written);
    vi.mocked(readTokenGraduation).mockResolvedValue(graduatedAt);

    const agent = await readAgent({ token });

    expect(agent.pausedAt).toEqual(written.pausedAt);
    expect(agent.stoppedAt).toBeNull();
    expect(agent.graduatedAt).toEqual(graduatedAt);
  });

  it("carries the time an AI Launchpad admin stopped the agent, so the creator can see why it is off X", async () => {
    const stoppedAt = new Date("2026-05-01T09:00:00.000Z");
    vi.mocked(findAgentByToken).mockResolvedValue({ ...written, stoppedAt });

    expect((await readAgent({ token })).stoppedAt).toEqual(stoppedAt);
  });

  it("carries the time the token's pool opened, as the indexer holds it, never the time AI Launchpad first looked", async () => {
    vi.mocked(readTokenGraduation).mockResolvedValue(graduatedAt);

    expect((await readAgent({ token })).graduatedAt).toEqual(graduatedAt);
  });

  it("returns a null graduation for a token whose pool has not opened, so a locked agent is readable as a fact", async () => {
    expect((await readAgent({ token })).graduatedAt).toBeNull();
  });

  it("leaves out the row's own timestamps, because the lazy row is an implementation detail the panel never sees", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue(written);

    const agent = await readAgent({ token });

    expect(agent).not.toHaveProperty("createdAt");
    expect(agent).not.toHaveProperty("updatedAt");
  });

  it("writes nothing, so asking about an agent never creates the row a write is supposed to create", async () => {
    await readAgent({ token });

    expect(prismaMock.agent.create).not.toHaveBeenCalled();
    expect(prismaMock.agent.upsert).not.toHaveBeenCalled();
    expect(prismaMock.agent.update).not.toHaveBeenCalled();
  });

  it("lets an indexer failure through as the indexer client named it, rather than guessing that the token has not graduated", async () => {
    const failure = new Error("named by the indexer client");

    vi.mocked(readTokenGraduation).mockRejectedValue(failure);

    await expect(readAgent({ token })).rejects.toBe(failure);
  });

  it("asks the row and the indexer about the token it was given, never a fixed one", async () => {
    await readAgent({ token });

    expect(findAgentByToken).toHaveBeenCalledWith(token);
    expect(readTokenGraduation).toHaveBeenCalledWith(token);
  });
});
