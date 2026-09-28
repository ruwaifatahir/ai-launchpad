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
import { stopAgent } from "@/features/core/agents/domain/stopping";

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

describe("stopAgent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(findAgentByToken).mockResolvedValue(row);
    vi.mocked(upsertAgentByToken).mockResolvedValue({ ...row, stoppedAt: now });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records the stop at the moment the admin asked for it, so an agent breaking X's rules is off at once", async () => {
    await stopAgent({ token });

    expect(upsertAgentByToken).toHaveBeenCalledWith(token, { stoppedAt: now });
  });

  it("stops a running agent, which is the state an agent breaking X's rules is normally in", async () => {
    await expect(stopAgent({ token })).resolves.toMatchObject({ token });
  });

  it("stops an agent the creator has already paused, so a pause is no shelter from the stop", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...row, pausedAt: earlier });

    await stopAgent({ token });

    expect(upsertAgentByToken).toHaveBeenCalledWith(token, { stoppedAt: now });
  });

  it("stops an agent the creator has never written to, because every token has an agent and the missing row is not a missing agent", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue(null);

    await expect(stopAgent({ token })).resolves.toMatchObject({ token });
  });

  it("keeps the time an already stopped agent was first stopped rather than restamping it, because the stop happened once", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...row, stoppedAt: earlier });

    await stopAgent({ token });

    expect(upsertAgentByToken).toHaveBeenCalledWith(token, { stoppedAt: earlier });
  });

  it("writes the stop time and nothing else, so a stopped agent keeps its persona, its topics, its pace and its pause", async () => {
    await stopAgent({ token });

    const [, data] = vi.mocked(upsertAgentByToken).mock.calls[0]!;

    expect(Object.keys(data)).toEqual(["stoppedAt"]);
  });

  it("never asks whether the token graduated, so a locked agent is stopped exactly like an unlocked one", async () => {
    await stopAgent({ token });

    expect(readTokenGraduation).not.toHaveBeenCalled();
  });

  it("acts on the token it was given, never a fixed one, so one stop never silences another token's agent", async () => {
    const other = "0xbcd4042de499d14e55001ccbb24a551f3b954096" as const;

    await stopAgent({ token: other });

    expect(findAgentByToken).toHaveBeenCalledWith(other);
    expect(upsertAgentByToken).toHaveBeenCalledWith(other, expect.anything());
  });

  it("returns only what the write recorded, leaving the persona and the pause to the read that owns them", async () => {
    const agent = await stopAgent({ token });

    expect(Object.keys(agent)).toEqual(["token", "stoppedAt", "updatedAt"]);
  });
});
