import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/agents/agents.repo", () => ({ findAgentByToken: vi.fn() }));
vi.mock("@/features/core/connections/data-model/connections.repo", () => ({
  findConnectionByToken: vi.fn(),
}));
vi.mock("@/features/core/connections/domain/consent", () => ({
  readConsentState: vi.fn(),
}));
vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));

import { readTokenGraduation } from "@/features/core/graduations/reading";
import { findAgentByToken } from "@/features/core/agents/agents.repo";
import { findConnectionByToken } from "@/features/core/connections/data-model/connections.repo";
import { readConsentState } from "@/features/core/connections/domain/consent";
import { readSilenceReason } from "@/features/core/posts/domain/eligibility";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;

const graduatedAt = new Date("2026-03-01T12:00:00.000Z");

const agent = {
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
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
};

const connection = {
  xUsername: "vector",
  confirmedAt: new Date("2026-03-02T00:00:00.000Z"),
};

const personaParts = ["name", "personality", "lore", "style"] as const;

describe("readSilenceReason", () => {
  beforeEach(() => {
    vi.mocked(findAgentByToken).mockResolvedValue(agent);
    vi.mocked(findConnectionByToken).mockResolvedValue(connection);
    vi.mocked(readConsentState).mockResolvedValue({ agreed: true, current: true });
  });

  it("lets an agent whose setup is finished speak, because every reason it could be silenced is a state somebody put it in", async () => {
    await expect(readSilenceReason(token, graduatedAt)).resolves.toBeNull();
  });

  it("silences an agent an AI Launchpad admin stopped, so the stop is real rather than a label", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...agent, stoppedAt: new Date() });

    await expect(readSilenceReason(token, graduatedAt)).resolves.toBe("stopped");
  });

  it("silences an agent whose token has not graduated, so the graduation gate holds", async () => {
    await expect(readSilenceReason(token, null)).resolves.toBe("locked");
  });

  it("silences an agent its creator paused, so a pause means what it says", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...agent, pausedAt: new Date() });

    await expect(readSilenceReason(token, graduatedAt)).resolves.toBe("paused");
  });

  it.each(personaParts)(
    "silences an agent missing its %s, because a persona counts as written only when all four parts are there",
    async (part) => {
      vi.mocked(findAgentByToken).mockResolvedValue({ ...agent, [part]: null });

      await expect(readSilenceReason(token, graduatedAt)).resolves.toBe("persona");
    },
  );

  it("silences a token the creator has never written anything for, because every token has an agent whether or not a row exists", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue(null);

    await expect(readSilenceReason(token, graduatedAt)).resolves.toBe("persona");
  });

  it("silences an agent whose creator never connected an X account, because there is no account for it to speak through", async () => {
    vi.mocked(findConnectionByToken).mockResolvedValue(null);

    await expect(readSilenceReason(token, graduatedAt)).resolves.toBe("connection");
  });

  it("counts credentials without an attestation as no connection, because a connection is finished only when the creator has given it", async () => {
    vi.mocked(findConnectionByToken).mockResolvedValue({
      ...connection,
      confirmedAt: null,
    });

    await expect(readSilenceReason(token, graduatedAt)).resolves.toBe("connection");
  });

  it("counts an agreement below the current consent version as no connection, so a version bump silences every agent until its creator agrees again", async () => {
    vi.mocked(readConsentState).mockResolvedValue({ agreed: true, current: false });

    await expect(readSilenceReason(token, graduatedAt)).resolves.toBe("connection");
  });

  it("names the stop ahead of the lock, so an admin decision outranks a state the chain owns", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...agent, stoppedAt: new Date() });

    await expect(readSilenceReason(token, null)).resolves.toBe("stopped");
  });

  it("names the lock ahead of the pause, so a locked agent reads as locked rather than as whatever its creator did next", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...agent, pausedAt: new Date() });

    await expect(readSilenceReason(token, null)).resolves.toBe("locked");
  });

  it("names the pause ahead of the persona, because a decision somebody made outranks a step they have not finished", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({
      ...agent,
      pausedAt: new Date(),
      name: null,
    });

    await expect(readSilenceReason(token, graduatedAt)).resolves.toBe("paused");
  });

  it("names the persona ahead of the connection, because the persona is the step a creator can finish before graduating", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...agent, name: null });
    vi.mocked(findConnectionByToken).mockResolvedValue(null);

    await expect(readSilenceReason(token, graduatedAt)).resolves.toBe("persona");
  });

  it("takes the graduation time from its caller and reads no graduation, so a locked agent costs no read on every tick", async () => {
    await readSilenceReason(token, graduatedAt);

    expect(readTokenGraduation).not.toHaveBeenCalled();
  });

  it("reads every fact from the token it was handed, so one agent's state never decides another's", async () => {
    await readSilenceReason(token, graduatedAt);

    expect(findAgentByToken).toHaveBeenCalledWith(token);
    expect(findConnectionByToken).toHaveBeenCalledWith(token);
    expect(readConsentState).toHaveBeenCalledWith(token);
  });
});
