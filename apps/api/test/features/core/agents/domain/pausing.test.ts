import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/agents/agents.repo", () => ({
  findAgentByToken: vi.fn(),
  upsertAgentByToken: vi.fn(),
}));
vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));

import { readTokenGraduation } from "@/features/core/graduations/reading";
import { findAgentByToken, upsertAgentByToken } from "@/features/core/agents/agents.repo";
import { setAgentPause } from "@/features/core/agents/domain/pausing";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;
const now = new Date("2026-05-01T09:00:00.000Z");
const earlier = new Date("2026-04-01T00:00:00.000Z");

const row = {
  token,
  name: "Vector",
  personality: "Terse and certain",
  lore: "Born in a warehouse",
  style: "Short sentences",
  topics: ["the curve"],
  pace: 4,
  nextPostAt: null,
  pausedAt: null as Date | null,
  stoppedAt: null as Date | null,
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
  updatedAt: now,
};

describe("setAgentPause", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(findAgentByToken).mockResolvedValue(null);
    vi.mocked(upsertAgentByToken).mockResolvedValue(row);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records the pause at the moment the creator asked for it, so a pause takes hold at once rather than at the end of a posting cycle", async () => {
    await setAgentPause({ token }, { paused: true });

    expect(upsertAgentByToken).toHaveBeenCalledWith(token, { pausedAt: now });
  });

  it("pauses a token the creator has never written to, because every token has an agent and the missing row is not a missing agent", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue(null);

    await expect(setAgentPause({ token }, { paused: true })).resolves.toMatchObject({
      token,
    });
  });

  it("keeps the time an already paused agent was silenced rather than restamping it, because a double click is not a second pause", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...row, pausedAt: earlier });

    await setAgentPause({ token }, { paused: true });

    expect(upsertAgentByToken).toHaveBeenCalledWith(token, { pausedAt: earlier });
  });

  it("clears the pause time on a resume, so the agent the creator started again reads back as running", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...row, pausedAt: earlier });

    await setAgentPause({ token }, { paused: false });

    expect(upsertAgentByToken).toHaveBeenCalledWith(token, { pausedAt: null });
  });

  it("resumes an agent that was never paused rather than erroring, because setting a state that already holds is not a failure", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue(row);

    await expect(setAgentPause({ token }, { paused: false })).resolves.toMatchObject({
      token,
    });
  });

  it("refuses to resume an agent an AI Launchpad admin stopped, because the creator cannot reverse a decision that was not theirs", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({
      ...row,
      pausedAt: earlier,
      stoppedAt: earlier,
    });

    await expect(setAgentPause({ token }, { paused: false })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("writes nothing when it refuses the resume, so a stopped agent is left exactly as the admin left it", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...row, stoppedAt: earlier });

    await expect(setAgentPause({ token }, { paused: false })).rejects.toThrow();
    expect(upsertAgentByToken).not.toHaveBeenCalled();
  });

  it("pauses an agent an AI Launchpad admin stopped, because the stop keeps it off X and refusing the pause would protect nothing", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...row, stoppedAt: earlier });

    await expect(setAgentPause({ token }, { paused: true })).resolves.toMatchObject({
      token,
    });
  });

  it("writes the pause time and nothing else, so a paused agent keeps its persona, its topics and its pace", async () => {
    await setAgentPause({ token }, { paused: true });

    const [, data] = vi.mocked(upsertAgentByToken).mock.calls[0]!;

    expect(Object.keys(data)).toEqual(["pausedAt"]);
  });

  it("never asks whether the token graduated, so a locked agent is paused and resumed exactly like an unlocked one", async () => {
    await setAgentPause({ token }, { paused: true });
    await setAgentPause({ token }, { paused: false });

    expect(readTokenGraduation).not.toHaveBeenCalled();
  });

  it("acts on the token it was given, never a fixed one, so one creator's pause never silences another token's agent", async () => {
    const other = "0xbcd4042de499d14e55001ccbb24a551f3b954096" as const;

    await setAgentPause({ token: other }, { paused: true });

    expect(findAgentByToken).toHaveBeenCalledWith(other);
    expect(upsertAgentByToken).toHaveBeenCalledWith(other, expect.anything());
  });

  it("returns only what the write recorded, leaving the persona and the stop to the read that owns them", async () => {
    const agent = await setAgentPause({ token }, { paused: true });

    expect(Object.keys(agent)).toEqual(["token", "pausedAt", "updatedAt"]);
  });
});
