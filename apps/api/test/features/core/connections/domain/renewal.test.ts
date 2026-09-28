import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/connections/data-model/connections.repo", () => ({
  deleteConnectionByToken: vi.fn(),
  findCredentialsByToken: vi.fn(),
  updateConnectionCredentials: vi.fn(),
}));
vi.mock("@/features/core/connections/data-model/connections.storage", () => ({
  releaseRenewalLock: vi.fn(),
  takeRenewalLock: vi.fn(),
}));
vi.mock("@/lib/x/oauth", async (original) => ({
  ...(await original<typeof import("@/lib/x/oauth")>()),
  renewGrant: vi.fn(),
}));

import { logger } from "@/lib/logger";
import { XGrantGoneError, XMisconfiguredError, renewGrant } from "@/lib/x/oauth";
import { XUnreachableError } from "@/lib/x/transport";
import {
  deleteConnectionByToken,
  findCredentialsByToken,
  updateConnectionCredentials,
} from "@/features/core/connections/data-model/connections.repo";
import {
  releaseRenewalLock,
  takeRenewalLock,
} from "@/features/core/connections/data-model/connections.storage";
import * as renewal from "@/features/core/connections/domain/renewal";

const { readLiveCredential } = renewal;

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;
const other = "0xbcd4042de499d14e55001ccbb24a551f3b954096" as const;
const third = "0xc0ffee254729296a45a3885639ac7e10f9d54979" as const;

const stored = {
  accessCredential: "the-access-credential-x-issued",
  refreshCredential: "the-refresh-credential-x-issued",
};

const renewed = {
  accessCredential: "the-access-credential-the-renewal-issued",
  refreshCredential: "the-refresh-credential-the-renewal-issued",
  expiresAt: new Date("2026-05-01T11:00:00.000Z"),
};

const connection = (expiresInMs: number) => ({
  ...stored,
  accessExpiresAt: new Date(Date.now() + expiresInMs),
});

const MINUTE = 60 * 1000;

const holding = (expiresInMs: number) =>
  vi.mocked(findCredentialsByToken).mockResolvedValue(connection(expiresInMs));

const written = () => vi.mocked(updateConnectionCredentials).mock.calls[0][1];

describe("readLiveCredential", () => {
  beforeEach(() => {
    vi.mocked(findCredentialsByToken).mockReset();
    holding(90 * MINUTE);
    vi.mocked(takeRenewalLock).mockResolvedValue(true);
    vi.mocked(renewGrant).mockResolvedValue(renewed);
  });

  it("hands back the stored credential while it is still live, so a connection is never spent renewing a credential that would have worked", async () => {
    await expect(readLiveCredential(token)).resolves.toBe(stored.accessCredential);

    expect(renewGrant).not.toHaveBeenCalled();
    expect(updateConnectionCredentials).not.toHaveBeenCalled();
  });

  it("takes no lock for a credential it is not going to renew, so an agent posting on a live credential never waits on another one", async () => {
    await readLiveCredential(token);

    expect(takeRenewalLock).not.toHaveBeenCalled();
  });

  it("renews a credential that has already expired, which is the state a paused agent comes back to", async () => {
    holding(-30 * MINUTE);

    await expect(readLiveCredential(token)).resolves.toBe(renewed.accessCredential);
    expect(renewGrant).toHaveBeenCalledWith(stored.refreshCredential);
  });

  it("renews a credential that is close enough to its expiry to die mid post, because the stored expiry exists so a caller renews ahead of a post rather than after a failure", async () => {
    holding(1 * MINUTE);

    await expect(readLiveCredential(token)).resolves.toBe(renewed.accessCredential);
    expect(renewGrant).toHaveBeenCalledTimes(1);
  });

  it("offers one entry point, which a caller asks and nothing calls on a timer, because a scheduled keep alive would rotate a paused agent's pair every hour and every rotation is a chance to lose it", () => {
    expect(Object.keys(renewal)).toEqual(["readLiveCredential"]);
    expect(renewGrant).not.toHaveBeenCalled();
  });

  it("lets one renewal run per connection, because two concurrent renewals spend the same refresh credential and one of them is expected to come back dead", async () => {
    holding(-30 * MINUTE);
    let held = false;
    vi.mocked(takeRenewalLock).mockImplementation(async () =>
      held ? false : (held = true),
    );

    await Promise.all([readLiveCredential(token), readLiveCredential(token)]);

    expect(renewGrant).toHaveBeenCalledTimes(1);
  });

  it("reads the pair again once it holds the lock, and renews with what the row holds now rather than with the pair it read before it queued, because the pair it read first may have been spent by the renewal it was queued behind", async () => {
    holding(-30 * MINUTE);
    vi.mocked(findCredentialsByToken).mockResolvedValueOnce(connection(-30 * MINUTE));
    vi.mocked(findCredentialsByToken).mockResolvedValueOnce({
      accessCredential: "the-access-credential-the-row-holds-now",
      refreshCredential: "the-refresh-credential-the-row-holds-now",
      accessExpiresAt: new Date(Date.now() - 1 * MINUTE),
    });

    await readLiveCredential(token);

    expect(findCredentialsByToken).toHaveBeenCalledTimes(2);
    expect(renewGrant).toHaveBeenCalledWith("the-refresh-credential-the-row-holds-now");
  });

  it("hands back the credential the renewal it was queued behind stored, and asks X for nothing, so a connection is never lost to a second renewal spending a credential the first one already spent", async () => {
    holding(-30 * MINUTE);
    vi.mocked(findCredentialsByToken).mockResolvedValueOnce(connection(-30 * MINUTE));
    vi.mocked(findCredentialsByToken).mockResolvedValueOnce({
      accessCredential: "the-access-credential-the-other-renewal-stored",
      refreshCredential: "the-refresh-credential-the-other-renewal-stored",
      accessExpiresAt: new Date(Date.now() + 90 * MINUTE),
    });

    await expect(readLiveCredential(token)).resolves.toBe(
      "the-access-credential-the-other-renewal-stored",
    );
    expect(renewGrant).not.toHaveBeenCalled();
    expect(deleteConnectionByToken).not.toHaveBeenCalled();
  });

  it("hands back nothing when the creator disconnected while this caller queued for the lock, so a renewal never writes back a row the creator has just deleted", async () => {
    holding(-30 * MINUTE);
    vi.mocked(findCredentialsByToken).mockResolvedValueOnce(connection(-30 * MINUTE));
    vi.mocked(findCredentialsByToken).mockResolvedValueOnce(null);

    await expect(readLiveCredential(token)).resolves.toBeNull();
    expect(renewGrant).not.toHaveBeenCalled();
    expect(updateConnectionCredentials).not.toHaveBeenCalled();
  });

  it("locks on the token, so one agent's renewal never blocks another's", async () => {
    holding(-30 * MINUTE);

    await readLiveCredential(token);

    expect(takeRenewalLock).toHaveBeenCalledWith(token);
  });

  it("hands back no credential to a caller that lost the race for the lock, so the second post is skipped rather than publishing with a credential the renewal is about to spend", async () => {
    holding(-30 * MINUTE);
    vi.mocked(takeRenewalLock).mockResolvedValue(false);

    await expect(readLiveCredential(token)).resolves.toBeNull();
    expect(renewGrant).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("hands the lock back once the renewal is over, so a failed renewal does not block the next attempt until the lock expires", async () => {
    holding(-30 * MINUTE);

    await readLiveCredential(token);

    expect(releaseRenewalLock).toHaveBeenCalledWith(token);
  });

  it("hands the lock back when the renewal failed too, because a lock held by a call that is over is a connection nothing can renew", async () => {
    holding(-30 * MINUTE);
    vi.mocked(renewGrant).mockRejectedValue(new XUnreachableError("timed out"));

    await readLiveCredential(token);

    expect(releaseRenewalLock).toHaveBeenCalledWith(token);
  });

  it("stores the whole new pair and the new expiry, because X hands back both halves and kills the old pair the same second", async () => {
    holding(-30 * MINUTE);

    await readLiveCredential(token);

    expect(written()).toEqual({
      accessCredential: renewed.accessCredential,
      refreshCredential: renewed.refreshCredential,
      accessExpiresAt: renewed.expiresAt,
    });
  });

  it("stores the new pair before the new credential reaches any caller, so a caller never publishes with a credential Postgres does not hold. The window between X issuing the pair and the write landing is not closed by anything here, because X gives no overlap, and a crash inside it costs that creator a reconnection", async () => {
    holding(-30 * MINUTE);
    vi.mocked(updateConnectionCredentials).mockRejectedValueOnce(
      new Error("postgres is down"),
    );

    await expect(readLiveCredential(token)).rejects.toThrow();
  });

  it("changes nothing when X cannot be reached, because an outage is worth waiting out and deleting a connection over one is a creator reconnecting for no reason", async () => {
    holding(-30 * MINUTE);
    vi.mocked(renewGrant).mockRejectedValue(new XUnreachableError("x answered 503"));

    await expect(readLiveCredential(token)).resolves.toBeNull();
    expect(deleteConnectionByToken).not.toHaveBeenCalled();
    expect(updateConnectionCredentials).not.toHaveBeenCalled();
  });

  it("logs the skipped renewal at warn when X cannot be reached, because the work is dropped silently and nothing else records it", async () => {
    holding(-30 * MINUTE);
    vi.mocked(renewGrant).mockRejectedValue(new XUnreachableError("x answered 503"));

    await readLiveCredential(token);

    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("changes nothing when X rejects AI Launchpad's own credentials, which is the single branch standing between a mistyped client secret in a deploy and every connection in the database being deleted inside an hour", async () => {
    holding(-30 * MINUTE);
    vi.mocked(renewGrant).mockRejectedValue(new XMisconfiguredError("x answered 401"));

    await expect(readLiveCredential(token)).resolves.toBeNull();
    expect(deleteConnectionByToken).not.toHaveBeenCalled();
    expect(updateConnectionCredentials).not.toHaveBeenCalled();
  });

  it("deletes not one connection when a deploy with a mistyped client secret answers 401 for every agent in turn, which is the whole reason this branch is told apart from the one below it", async () => {
    holding(-30 * MINUTE);
    vi.mocked(renewGrant).mockRejectedValue(new XMisconfiguredError("x answered 401"));

    for (const each of [token, other, third]) await readLiveCredential(each);

    expect(deleteConnectionByToken).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(3);
  });

  it("tells AI Launchpad's own wrong credentials apart from a grant that is gone even though X answers both with a 4xx, because the two differ by one digit and only one of them ends a connection", async () => {
    holding(-30 * MINUTE);
    vi.mocked(renewGrant).mockRejectedValueOnce(
      new XMisconfiguredError("x answered 401"),
    );

    await readLiveCredential(token);

    expect(deleteConnectionByToken).not.toHaveBeenCalled();

    vi.mocked(renewGrant).mockRejectedValueOnce(new XGrantGoneError("x answered 400"));

    await readLiveCredential(token);

    expect(deleteConnectionByToken).toHaveBeenCalledTimes(1);
  });

  it("logs AI Launchpad's own wrong credentials at error, because a value of ours that is wrong is ours to fix rather than an outage to wait out", async () => {
    holding(-30 * MINUTE);
    vi.mocked(renewGrant).mockRejectedValue(new XMisconfiguredError("x answered 401"));

    await readLiveCredential(token);

    expect(logger.error).toHaveBeenCalled();
  });

  it("deletes the connection when X says the grant is gone, because that is how a revoke at X reaches AI Launchpad at all and the absence of a row is what disconnected means", async () => {
    holding(-30 * MINUTE);
    vi.mocked(renewGrant).mockRejectedValue(new XGrantGoneError("x answered 400"));

    await expect(readLiveCredential(token)).resolves.toBeNull();
    expect(deleteConnectionByToken).toHaveBeenCalledWith(token);
    expect(updateConnectionCredentials).not.toHaveBeenCalled();
  });

  it("logs the ended connection at warn, because the creator is told the next time they open the panel and nothing else records that the agent went quiet", async () => {
    holding(-30 * MINUTE);
    vi.mocked(renewGrant).mockRejectedValue(new XGrantGoneError("x answered 400"));

    await readLiveCredential(token);

    expect(logger.warn).toHaveBeenCalled();
  });

  it("lets a failure X has no name for reach the caller rather than treating it as an outage to wait out or a grant to delete", async () => {
    holding(-30 * MINUTE);
    vi.mocked(renewGrant).mockRejectedValue(new Error("x answered 403"));

    await expect(readLiveCredential(token)).rejects.toThrow();
    expect(deleteConnectionByToken).not.toHaveBeenCalled();
  });

  it("hands back no credential for a token holding no connection, and asks X nothing, so a disconnected agent costs one read", async () => {
    vi.mocked(findCredentialsByToken).mockResolvedValue(null);

    await expect(readLiveCredential(token)).resolves.toBeNull();
    expect(renewGrant).not.toHaveBeenCalled();
    expect(takeRenewalLock).not.toHaveBeenCalled();
  });

  it("logs no credential anywhere, because a credential in a log is a credential leaked through a different door", async () => {
    holding(-30 * MINUTE);

    await readLiveCredential(token);

    const logged = JSON.stringify([
      ...vi.mocked(logger.info).mock.calls,
      ...vi.mocked(logger.warn).mock.calls,
      ...vi.mocked(logger.error).mock.calls,
    ]);

    expect(logged).toContain(token);
    expect(logged).not.toContain(stored.accessCredential);
    expect(logged).not.toContain(stored.refreshCredential);
    expect(logged).not.toContain(renewed.accessCredential);
    expect(logged).not.toContain(renewed.refreshCredential);
  });
});
