import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/connections/data-model/connections.repo", () => ({
  updateConnectionAttestation: vi.fn(),
}));
vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));
// Mocked so the test can assert that nothing here reaches X. AI Launchpad can neither
// turn the automated label on nor read it back, so the whole of gate three is the
// creator's word and no call is made to check it.
vi.mock("@/lib/x/oauth", () => ({
  authorizeUrl: vi.fn(),
  exchangeCode: vi.fn(),
  readAccount: vi.fn(),
  renewGrant: vi.fn(),
  revokeGrant: vi.fn(),
}));

import { readTokenGraduation } from "@/features/core/graduations/reading";
import { logger } from "@/lib/logger";
import * as x from "@/lib/x/oauth";
import { updateConnectionAttestation } from "@/features/core/connections/data-model/connections.repo";
import { recordAttestation } from "@/features/core/connections/domain/attestation";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;
const graduatedAt = new Date("2026-03-01T12:00:00.000Z");

const written = () => vi.mocked(updateConnectionAttestation).mock.calls[0][1];

describe("recordAttestation", () => {
  beforeEach(() => {
    vi.mocked(readTokenGraduation).mockResolvedValue(graduatedAt);
    vi.mocked(updateConnectionAttestation).mockResolvedValue({ count: 1 });
  });

  it("dates the creator's word rather than flagging it, because the last gate is a thing they said at a time", async () => {
    const attested = await recordAttestation({ token });

    expect(written()).toBeInstanceOf(Date);
    expect(attested).toEqual({ token, confirmedAt: written() });
  });

  it("takes both the automated label and the link in the bio in one action, so finishing is one step rather than two", async () => {
    await recordAttestation({ token });

    expect(updateConnectionAttestation).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateConnectionAttestation).mock.calls[0][0]).toBe(token);
  });

  it("runs no check against X for either step, because no API sets the automated label or the bio link and no API reads either one back", async () => {
    await recordAttestation({ token });

    for (const call of Object.values(x)) expect(call).not.toHaveBeenCalled();
  });

  it("succeeds when the creator confirms again rather than erroring, because saying so twice is not a conflict", async () => {
    await recordAttestation({ token });

    await expect(recordAttestation({ token })).resolves.toMatchObject({ token });
  });

  it("records their word again on a second confirmation, because it is a fresh assertion rather than a replay of the first", async () => {
    vi.setSystemTime(new Date("2026-05-01T09:00:00.000Z"));
    await recordAttestation({ token });

    vi.setSystemTime(new Date("2026-06-01T09:00:00.000Z"));
    const second = await recordAttestation({ token });

    expect(second.confirmedAt).toEqual(new Date("2026-06-01T09:00:00.000Z"));
    vi.useRealTimers();
  });

  it("refuses a token that has not graduated with a conflict, because connecting an X account waits for graduation", async () => {
    vi.mocked(readTokenGraduation).mockResolvedValue(null);

    await expect(recordAttestation({ token })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(updateConnectionAttestation).not.toHaveBeenCalled();
  });

  it("lets a graduation that cannot be read stop the write, so a dead indexer never confirms anything for an ungraduated token", async () => {
    vi.mocked(readTokenGraduation).mockRejectedValue(new Error("fetch failed"));

    await expect(recordAttestation({ token })).rejects.toThrow();
    expect(updateConnectionAttestation).not.toHaveBeenCalled();
  });

  it("refuses a token with no X account connected, because there is nothing to confirm about an account that is not there", async () => {
    vi.mocked(updateConnectionAttestation).mockResolvedValue({ count: 0 });

    await expect(recordAttestation({ token })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("tells the creator a connection is missing from the write itself, so a connection deleted a moment earlier is a refusal rather than a server error", async () => {
    vi.mocked(updateConnectionAttestation).mockResolvedValue({ count: 0 });

    await expect(recordAttestation({ token })).rejects.toMatchObject({
      message: expect.stringContaining("Connect an X account"),
    });
    expect(updateConnectionAttestation).toHaveBeenCalledTimes(1);
  });

  it("logs the token alone, so no credential and no handle reaches the log for a state change the operator only needs to date", async () => {
    await recordAttestation({ token });

    expect(logger.info).toHaveBeenCalledWith("attestation recorded", { token });
  });
});
