import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/agents/agents.repo", () => ({ upsertAgentByToken: vi.fn() }));
vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));

import { readTokenGraduation } from "@/features/core/graduations/reading";
import { upsertAgentByToken } from "@/features/core/agents/agents.repo";
import { reviseAgent } from "@/features/core/agents/domain/revision";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;

const row = {
  token,
  name: null,
  personality: null,
  lore: null,
  style: null,
  topics: [],
  pace: 1,
  nextPostAt: null,
  pausedAt: null,
  stoppedAt: null,
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
};

describe("reviseAgent", () => {
  beforeEach(() => {
    vi.mocked(upsertAgentByToken).mockResolvedValue(row);
  });

  it("writes one persona part on its own, so a creator builds the persona over several sittings rather than in one go", async () => {
    await reviseAgent({ token }, { lore: "Born in a warehouse" });

    expect(upsertAgentByToken).toHaveBeenCalledWith(token, {
      lore: "Born in a warehouse",
    });
  });

  it("passes only the supplied fields to the write, so a part the creator left out is untouched rather than cleared", async () => {
    await reviseAgent({ token }, { pace: 3 });

    expect(upsertAgentByToken).toHaveBeenCalledWith(token, { pace: 3 });
  });

  it("clears a part the creator sent as null, because deleting lore they regret is not the same as replacing it", async () => {
    await reviseAgent({ token }, { lore: null });

    expect(upsertAgentByToken).toHaveBeenCalledWith(token, { lore: null });
  });

  it("returns all four persona parts whether or not this write touched them, so a creator who wrote one can see which three are still empty", async () => {
    const agent = await reviseAgent({ token }, { name: "Vector" });

    expect(agent).toMatchObject({
      name: null,
      personality: null,
      lore: null,
      style: null,
    });
  });

  it("returns what it recorded and the new updatedAt, leaving out the three state times this write never touches", async () => {
    const agent = await reviseAgent({ token }, { name: "Vector" });

    expect(Object.keys(agent)).toEqual([
      "token",
      "name",
      "personality",
      "lore",
      "style",
      "topics",
      "pace",
      "updatedAt",
    ]);
  });

  it("writes to the token it was given, never a fixed one, so one creator's edit never lands on another token's agent", async () => {
    const other = "0xbcd4042de499d14e55001ccbb24a551f3b954096" as const;

    await reviseAgent({ token: other }, { name: "Vector" });

    expect(upsertAgentByToken).toHaveBeenCalledWith(other, { name: "Vector" });
  });

  it("edits a stopped agent rather than refusing, because nothing publishes while a stop holds and refusing the edit would protect nothing", async () => {
    vi.mocked(upsertAgentByToken).mockResolvedValue({
      ...row,
      stoppedAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    await expect(reviseAgent({ token }, { name: "Vector" })).resolves.toMatchObject({
      token,
    });
  });

  it("edits a paused agent rather than refusing, so a creator can keep working on the persona while the agent is silent", async () => {
    vi.mocked(upsertAgentByToken).mockResolvedValue({
      ...row,
      pausedAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    await expect(reviseAgent({ token }, { name: "Vector" })).resolves.toMatchObject({
      token,
    });
  });

  it("never asks whether the token graduated, so a locked agent is written to exactly like an unlocked one", async () => {
    await reviseAgent({ token }, { name: "Vector" });

    expect(readTokenGraduation).not.toHaveBeenCalled();
  });
});
