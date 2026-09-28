import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/connections/data-model/connections.repo", () => ({
  deleteConnectionByToken: vi.fn(),
  findRefreshCredentialByToken: vi.fn(),
}));
vi.mock("@/lib/x/oauth", () => ({ revokeGrant: vi.fn() }));
vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));

import { readTokenGraduation } from "@/features/core/graduations/reading";
import { logger } from "@/lib/logger";
import { revokeGrant } from "@/lib/x/oauth";
import {
  deleteConnectionByToken,
  findRefreshCredentialByToken,
} from "@/features/core/connections/data-model/connections.repo";
import { disconnectAccount } from "@/features/core/connections/domain/removal";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e";

const refreshCredential = "the-refresh-credential-x-issued";

describe("disconnectAccount", () => {
  beforeEach(() => {
    vi.mocked(findRefreshCredentialByToken).mockResolvedValue(refreshCredential);
    vi.mocked(revokeGrant).mockResolvedValue(undefined);
  });

  it("deletes the connection, because the absence of a row is what disconnected means and a deleted row stops the agent at once", async () => {
    await expect(disconnectAccount({ token })).resolves.toEqual({ token });

    expect(deleteConnectionByToken).toHaveBeenCalledWith(token);
  });

  it("hands the refresh credential back to X before it deletes the row, so a connection AI Launchpad has forgotten is not left listed in the creator's connected apps at X", async () => {
    await disconnectAccount({ token });

    expect(revokeGrant).toHaveBeenCalledWith(refreshCredential);
    expect(vi.mocked(revokeGrant).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteConnectionByToken).mock.invocationCallOrder[0],
    );
  });

  it("revokes the refresh credential alone, because whether that kills the access credential too is undocumented and it dies by expiry either way", async () => {
    await disconnectAccount({ token });

    expect(revokeGrant).toHaveBeenCalledTimes(1);
  });

  it("deletes the row and logs at warn when the revoke is refused, and equally when X never answers and the client's own deadline raises the same rejection, so a creator is never held connected by an answer X does not document", async () => {
    vi.mocked(revokeGrant).mockRejectedValue(new Error("X could not be reached."));

    await expect(disconnectAccount({ token })).resolves.toEqual({ token });

    expect(deleteConnectionByToken).toHaveBeenCalledWith(token);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("answers 404 for a token with no connection rather than letting the delete fail in the database, so disconnecting what is not connected is not a server error", async () => {
    vi.mocked(findRefreshCredentialByToken).mockResolvedValue(null);

    await expect(disconnectAccount({ token })).rejects.toMatchObject({ statusCode: 404 });

    expect(revokeGrant).not.toHaveBeenCalled();
    expect(deleteConnectionByToken).not.toHaveBeenCalled();
  });

  it("refuses nothing on graduation grounds, because graduation never reverses and a connected agent is a graduated one by construction", async () => {
    await expect(disconnectAccount({ token })).resolves.toEqual({ token });

    expect(readTokenGraduation).not.toHaveBeenCalled();
  });

  it("logs no credential anywhere, because a credential in a log is a credential leaked through a different door", async () => {
    await disconnectAccount({ token });

    const logged = JSON.stringify([
      ...vi.mocked(logger.info).mock.calls,
      ...vi.mocked(logger.warn).mock.calls,
    ]);

    expect(logged).toContain(token);
    expect(logged).not.toContain(refreshCredential);
  });
});
