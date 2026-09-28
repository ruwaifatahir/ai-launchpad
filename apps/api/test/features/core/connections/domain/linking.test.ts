import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/connections/data-model/connections.repo", () => ({
  findConnectionByXUserId: vi.fn(),
  upsertConnection: vi.fn(),
}));
vi.mock("@/features/core/connections/data-model/connections.storage", () => ({
  takeHandshake: vi.fn(),
}));
vi.mock("@/lib/x/oauth", () => ({
  exchangeCode: vi.fn(),
  readAccount: vi.fn(),
  revokeGrant: vi.fn(),
}));

import { logger } from "@/lib/logger";
import { exchangeCode, readAccount, revokeGrant } from "@/lib/x/oauth";
import {
  findConnectionByXUserId,
  upsertConnection,
} from "@/features/core/connections/data-model/connections.repo";
import { takeHandshake } from "@/features/core/connections/data-model/connections.storage";
import { linkAccount } from "@/features/core/connections/domain/linking";
import type { CallbackQuery } from "@/features/core/connections/domain/schema";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;
const other = "0xbcd4042de499d14e55001ccbb24a551f3b954096" as const;
const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e" as const;

const state = "aStateTheAppIssued";
const verifier = "aVerifierNobodyButTheAppHolds";

const grant = {
  accessCredential: "the-access-credential-x-issued",
  refreshCredential: "the-refresh-credential-x-issued",
  expiresAt: new Date("2026-05-01T11:00:00.000Z"),
};

const account = { id: "1799384720384720384", handle: "agentofthings" };

const returned = { state, code: "theCodeXSentBack" };

const declined = { state, error: "access_denied" };

const written = () => vi.mocked(upsertConnection).mock.calls[0][1];

describe("linkAccount", () => {
  beforeEach(() => {
    vi.mocked(takeHandshake).mockResolvedValue({ verifier, token, wallet });
    vi.mocked(exchangeCode).mockResolvedValue(grant);
    vi.mocked(readAccount).mockResolvedValue(account);
    vi.mocked(findConnectionByXUserId).mockResolvedValue(null);
    vi.mocked(revokeGrant).mockResolvedValue(undefined);
    vi.mocked(upsertConnection).mockResolvedValue({} as never);
  });

  it("exchanges the code, reads which account it got and records the connection, which is what the return from X exists to do", async () => {
    await linkAccount(returned);

    expect(exchangeCode).toHaveBeenCalledWith({ code: returned.code, verifier });
    expect(readAccount).toHaveBeenCalledWith(grant.accessCredential);
    expect(vi.mocked(upsertConnection).mock.calls[0][0]).toBe(token);
    expect(written()).toMatchObject({
      xUserId: account.id,
      xUsername: account.handle,
      accessCredential: grant.accessCredential,
      refreshCredential: grant.refreshCredential,
    });
  });

  it("takes the token from the stored handshake and ignores one named in the request, which is what stops a forged return attaching an X account to a token its caller does not own", async () => {
    await linkAccount({ ...returned, token: other } as unknown as CallbackQuery);

    expect(vi.mocked(upsertConnection).mock.calls[0][0]).toBe(token);
  });

  it("looks the handshake up by the state alone, because the state is the only thing vouching for a request that carries no credential", async () => {
    await linkAccount(returned);

    expect(takeHandshake).toHaveBeenCalledWith(state);
  });

  it("ends a return carrying a state AI Launchpad is not holding as expired and names no token, so an unknown state, an expired one and an already consumed one all finish nothing and a forged state points the panel nowhere", async () => {
    vi.mocked(takeHandshake).mockResolvedValue(null);

    await expect(linkAccount(returned)).resolves.toEqual({
      connected: false,
      reason: "expired",
    });
  });

  it("asks X for nothing and writes nothing when the state is not one AI Launchpad issued, so a forged return costs a request and no state", async () => {
    vi.mocked(takeHandshake).mockResolvedValue(null);

    await linkAccount(returned);
    expect(exchangeCode).not.toHaveBeenCalled();
    expect(upsertConnection).not.toHaveBeenCalled();
  });

  it("consumes the state before it asks X anything, so one return finishes one attempt", async () => {
    await linkAccount(returned);

    expect(vi.mocked(takeHandshake).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(exchangeCode).mock.invocationCallOrder[0],
    );
  });

  it("stores the expiry X gave, so a later caller renews ahead of a post rather than after a failure", async () => {
    await linkAccount(returned);

    expect(written().accessExpiresAt).toBe(grant.expiresAt);
  });

  it("reads the handle once and stores it as last known, because a read needs a live access credential and every read is billed", async () => {
    await linkAccount(returned);

    expect(readAccount).toHaveBeenCalledTimes(1);
    expect(written().xUsername).toBe(account.handle);
  });

  it("records no wallet and no consent version, because the creator is on chain and a copied version is what would let a version bump fail to bite", async () => {
    await linkAccount(returned);

    expect(written()).not.toHaveProperty("wallet");
    expect(written()).not.toHaveProperty("version");
  });

  it("leaves the connection unattested, because the creator's word on X's automated label and the bio link is a separate step AI Launchpad cannot check", async () => {
    await linkAccount(returned);

    expect(written().confirmedAt).toBeNull();
  });

  it("refuses an X account already connected to another token as taken, naming the creator's own token and never the other one", async () => {
    vi.mocked(findConnectionByXUserId).mockResolvedValue({ token: other });

    await expect(linkAccount(returned)).resolves.toEqual({
      connected: false,
      reason: "taken",
      token,
    });
  });

  it("refuses the loser of two tokens racing to link one X account as taken too, because the unique index settles the race the read cannot", async () => {
    vi.mocked(upsertConnection).mockResolvedValueOnce(null);

    await expect(linkAccount(returned)).resolves.toEqual({
      connected: false,
      reason: "taken",
      token,
    });
    expect(revokeGrant).toHaveBeenCalledWith(grant.refreshCredential);
  });

  it("sends the creator back as an error on any other write failure, so a database outage is never dressed up as a taken account", async () => {
    vi.mocked(upsertConnection).mockRejectedValueOnce(new Error("connection refused"));

    await expect(linkAccount(returned)).resolves.toEqual({
      connected: false,
      reason: "error",
      token,
    });
    expect(revokeGrant).not.toHaveBeenCalled();
  });

  it("logs a failure at error, because a creator sent back with no reason they can act on leaves only the log to say what broke", async () => {
    const outage = new Error("X could not be reached.");
    vi.mocked(exchangeCode).mockRejectedValue(outage);

    await linkAccount(returned);

    expect(logger.error).toHaveBeenCalledWith("x account not connected", {
      token,
      cause: outage,
    });
  });

  it("hands the grant it just obtained back to X before it refuses, so no unused grant sits on the creator's X account", async () => {
    vi.mocked(findConnectionByXUserId).mockResolvedValue({ token: other });

    await linkAccount(returned);
    expect(revokeGrant).toHaveBeenCalledWith(grant.refreshCredential);
    expect(upsertConnection).not.toHaveBeenCalled();
  });

  it("still answers the refusal when X will not take the grant back, so the creator learns the rule rather than an outage they can do nothing about", async () => {
    vi.mocked(findConnectionByXUserId).mockResolvedValue({ token: other });
    vi.mocked(revokeGrant).mockRejectedValue(new Error("X could not be reached."));

    await expect(linkAccount(returned)).resolves.toMatchObject({ reason: "taken" });
    expect(logger.warn).toHaveBeenCalled();
    expect(upsertConnection).not.toHaveBeenCalled();
  });

  it("lets a token connect the X account it already holds, because the rule is one account to one token rather than one account once", async () => {
    vi.mocked(findConnectionByXUserId).mockResolvedValue({ token });

    await expect(linkAccount(returned)).resolves.toEqual({ connected: true, token });
    expect(revokeGrant).not.toHaveBeenCalled();
    expect(upsertConnection).toHaveBeenCalledTimes(1);
  });

  it("sends the creator back as declined when X reports they declined, and writes nothing, because declining is a choice rather than a fault", async () => {
    await expect(linkAccount(declined)).resolves.toEqual({
      connected: false,
      reason: "declined",
      token,
    });
    expect(exchangeCode).not.toHaveBeenCalled();
    expect(upsertConnection).not.toHaveBeenCalled();
  });

  it("sends the creator back as an error when X ends the attempt for any reason other than their refusal, because telling them they declined would be untrue", async () => {
    await expect(linkAccount({ state, error: "server_error" })).resolves.toEqual({
      connected: false,
      reason: "error",
      token,
    });
    expect(exchangeCode).not.toHaveBeenCalled();
    expect(upsertConnection).not.toHaveBeenCalled();
  });

  it("logs the error X sent at warn when it is not a refusal, so a bad scope or redirect of ours shows up in the logs", async () => {
    await linkAccount({ state, error: "server_error" });

    expect(logger.warn).toHaveBeenCalledWith(
      "handshake ended without a grant",
      expect.objectContaining({ token, error: "server_error" }),
    );
  });

  it("consumes the state when the creator declines too, so an abandoned attempt cannot be returned to a second time", async () => {
    await linkAccount(declined);

    expect(takeHandshake).toHaveBeenCalledWith(state);
  });

  it("ends a decline carrying a state AI Launchpad is not holding as expired, so the state vouches for every return and not only the ones that carry a code", async () => {
    vi.mocked(takeHandshake).mockResolvedValue(null);

    await expect(linkAccount(declined)).resolves.toEqual({
      connected: false,
      reason: "expired",
    });
  });

  it("logs a decline at warn, because an attempt that ends in no connection is work dropped and nothing else records it", async () => {
    await linkAccount(declined);

    expect(logger.warn).toHaveBeenCalled();
  });

  it("sends the creator back as an error and writes nothing when X cannot be reached for the exchange, so an outage leaves no half connection behind", async () => {
    vi.mocked(exchangeCode).mockRejectedValue(new Error("X could not be reached."));

    await expect(linkAccount(returned)).resolves.toEqual({
      connected: false,
      reason: "error",
      token,
    });
    expect(upsertConnection).not.toHaveBeenCalled();
  });

  it("sends the creator back as an error and writes nothing when the account read fails, because a connection naming no account is a row nothing can use", async () => {
    vi.mocked(readAccount).mockRejectedValue(new Error("X could not be reached."));

    await expect(linkAccount(returned)).resolves.toEqual({
      connected: false,
      reason: "error",
      token,
    });
    expect(upsertConnection).not.toHaveBeenCalled();
  });

  it("hands back that the account connected and which token it serves, so the panel knows which agent to show the creator on their return", async () => {
    await expect(linkAccount(returned)).resolves.toEqual({ connected: true, token });
  });

  it("logs no credential anywhere, because a credential in a log is a credential leaked through a different door", async () => {
    await linkAccount(returned);

    const logged = JSON.stringify([
      ...vi.mocked(logger.info).mock.calls,
      ...vi.mocked(logger.warn).mock.calls,
      ...vi.mocked(logger.error).mock.calls,
    ]);

    expect(logged).toContain(token);
    expect(logged).not.toContain(grant.accessCredential);
    expect(logged).not.toContain(grant.refreshCredential);
  });
});
