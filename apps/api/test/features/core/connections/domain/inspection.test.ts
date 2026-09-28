import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { findConnectionByToken } from "@/features/core/connections/data-model/connections.repo";
import { readConsentState } from "@/features/core/connections/domain/consent";
import { readConnection } from "@/features/core/connections/domain/inspection";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;
const graduatedAt = new Date("2026-03-01T12:00:00.000Z");
const confirmedAt = new Date("2026-05-01T09:00:00.000Z");

const finished = { xUsername: "agentofthings", confirmedAt };

describe("readConnection", () => {
  beforeEach(() => {
    vi.mocked(readTokenGraduation).mockResolvedValue(graduatedAt);
    vi.mocked(readConsentState).mockResolvedValue({ agreed: true, current: true });
    vi.mocked(findConnectionByToken).mockResolvedValue(finished);
  });

  it("names the connected account by the handle stored when it connected, because AI Launchpad never refreshes it and a creator who renamed on X must not be told the new one", async () => {
    const connection = await readConnection({ token });

    expect(connection.xUsername).toBe("agentofthings");
  });

  it("carries no credential, because the two X credentials never leave AI Launchpad in any response", async () => {
    const connection = await readConnection({ token });

    expect(Object.keys(connection)).toEqual([
      "token",
      "xUsername",
      "confirmedAt",
      "outstandingGate",
      "disconnected",
    ]);
  });

  it("reports no outstanding gate once all three are done, which is the only state in which the agent may publish", async () => {
    const connection = await readConnection({ token });

    expect(connection.outstandingGate).toBeNull();
    expect(connection.confirmedAt).toBe(confirmedAt);
  });

  it("reports the agreement as outstanding for a creator who has agreed to nothing, so the panel shows the first step rather than sending them to X", async () => {
    vi.mocked(readConsentState).mockResolvedValue({ agreed: false, current: false });
    vi.mocked(findConnectionByToken).mockResolvedValue(null);

    expect((await readConnection({ token })).outstandingGate).toBe("consent");
  });

  it("reports the agreement as outstanding when it is out of date even though the account is still connected, so a creator silenced by a version bump knows to agree again", async () => {
    vi.mocked(readConsentState).mockResolvedValue({ agreed: true, current: false });

    const connection = await readConnection({ token });

    expect(connection.outstandingGate).toBe("consent");
    expect(connection.xUsername).toBe("agentofthings");
  });

  it("reports authorizing as outstanding for a creator who has agreed and connected no account, which is the step that sends them to X", async () => {
    vi.mocked(findConnectionByToken).mockResolvedValue(null);

    expect((await readConnection({ token })).outstandingGate).toBe("authorization");
  });

  it("reports the attestation as outstanding for an account connected without it, because credentials and no attestation is a real state that publishes nothing", async () => {
    vi.mocked(findConnectionByToken).mockResolvedValue({
      ...finished,
      confirmedAt: null,
    });

    const connection = await readConnection({ token });

    expect(connection.outstandingGate).toBe("attestation");
    expect(connection.confirmedAt).toBeNull();
  });

  it("names one gate at a time and puts the agreement first, because X says authorizing is not by itself consent to act", async () => {
    vi.mocked(readConsentState).mockResolvedValue({ agreed: false, current: false });
    vi.mocked(findConnectionByToken).mockResolvedValue({
      ...finished,
      confirmedAt: null,
    });

    expect((await readConnection({ token })).outstandingGate).toBe("consent");
  });

  it("reads a token that never connected differently from one whose connection ended, which is what tells connect X from connect X again", async () => {
    vi.mocked(readConsentState).mockResolvedValue({ agreed: false, current: false });
    vi.mocked(findConnectionByToken).mockResolvedValue(null);

    expect((await readConnection({ token })).disconnected).toBe(false);

    vi.mocked(readConsentState).mockResolvedValue({ agreed: true, current: true });

    expect((await readConnection({ token })).disconnected).toBe(true);
  });

  it("reports a live connection as connected rather than ended, so a creator part way through setting up is never told to start over", async () => {
    vi.mocked(findConnectionByToken).mockResolvedValue({
      ...finished,
      confirmedAt: null,
    });

    expect((await readConnection({ token })).disconnected).toBe(false);
  });

  it("refuses a token that has not graduated with a conflict, because there is no connection to report before then", async () => {
    vi.mocked(readTokenGraduation).mockResolvedValue(null);

    await expect(readConnection({ token })).rejects.toMatchObject({ statusCode: 409 });
    expect(findConnectionByToken).not.toHaveBeenCalled();
  });

  it("lets a graduation that cannot be read stop the read, so a dead indexer never answers for an ungraduated token", async () => {
    vi.mocked(readTokenGraduation).mockRejectedValue(new Error("fetch failed"));

    await expect(readConnection({ token })).rejects.toThrow();
    expect(findConnectionByToken).not.toHaveBeenCalled();
  });
});
