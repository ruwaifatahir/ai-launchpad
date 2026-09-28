import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { decrypt, encrypt } from "@/lib/encryption/cipher";
import {
  createConsent,
  deleteConnectionByToken,
  findConnectionByToken,
  findConnectionByXUserId,
  findCredentialsByToken,
  findLatestConsentByToken,
  findRefreshCredentialByToken,
  updateConnectionAttestation,
  updateConnectionCredentials,
  upsertConnection,
} from "@/features/core/connections/data-model/connections.repo";
import { prismaMock } from "@test/helpers/prisma.mock";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e";
const other = "0xbcd4042de499d14e55001ccbb24a551f3b954096";
const wallet = "0x1111111111111111111111111111111111111111";

describe("connections.repo", () => {
  it("createConsent inserts a row rather than upserting one, so agreeing again records a second agreement instead of overwriting the first", () => {
    createConsent(token, { wallet, version: 1 });

    expect(prismaMock.consent.create).toHaveBeenCalledWith({
      data: { token, wallet, version: 1 },
    });
    expect(prismaMock.consent.upsert).not.toHaveBeenCalled();
  });

  it("createConsent writes against the token it was handed, never a fixed one, so one creator's agreement never lands on another token", () => {
    createConsent(other, { wallet, version: 2 });

    expect(prismaMock.consent.create).toHaveBeenCalledWith({
      data: { token: other, wallet, version: 2 },
    });
  });

  it("findLatestConsentByToken orders by the time agreed descending, because consent is append only and only the newest row answers the gate", () => {
    findLatestConsentByToken(token);

    expect(prismaMock.consent.findFirst).toHaveBeenCalledWith({
      where: { token },
      orderBy: { agreedAt: "desc" },
    });
  });

  it("findLatestConsentByToken looks up the token it was handed, so one creator's agreement never answers for another token", () => {
    findLatestConsentByToken(other);

    expect(prismaMock.consent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: other } }),
    );
  });
});

const xUserId = "1799384720384720384";

const grant = {
  xUserId,
  xUsername: "agentofthings",
  accessCredential: "the-access-credential-x-issued",
  refreshCredential: "the-refresh-credential-x-issued",
  accessExpiresAt: new Date("2026-05-01T11:00:00.000Z"),
  confirmedAt: null,
};

const upserted = () => vi.mocked(prismaMock.connection.upsert).mock.calls[0][0];

describe("connections.repo, the connection row", () => {
  it("upsertConnection keys the row by the token, because one agent holds one connection and the token is its identity", async () => {
    await upsertConnection(token, grant);

    expect(upserted().where).toEqual({ token });
    expect(upserted().create.token).toBe(token);
  });

  it("upsertConnection answers null when another token already holds the X account, so two tokens racing for one account leave the loser a refusal the domain can word", async () => {
    prismaMock.connection.upsert.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6",
      }),
    );

    await expect(upsertConnection(token, grant)).resolves.toBeNull();
  });

  it("upsertConnection lets every other failure through, so an outage is never read as a taken account", async () => {
    prismaMock.connection.upsert.mockRejectedValueOnce(new Error("connection refused"));

    await expect(upsertConnection(token, grant)).rejects.toThrow("connection refused");
  });

  it("upsertConnection seals both credentials, so what reaches Postgres is never the plaintext a leaked dump could publish with", async () => {
    await upsertConnection(token, grant);

    expect(upserted().create.accessCredential).not.toBe(grant.accessCredential);
    expect(upserted().create.refreshCredential).not.toBe(grant.refreshCredential);
    expect(decrypt(upserted().create.accessCredential)).toBe(grant.accessCredential);
    expect(decrypt(upserted().create.refreshCredential)).toBe(grant.refreshCredential);
  });

  it("upsertConnection seals the credentials on the update as well as the create, so connecting again never lands a plaintext credential in a row that already existed", async () => {
    await upsertConnection(token, grant);

    expect(upserted().update.accessCredential).not.toBe(grant.accessCredential);
    expect(decrypt(upserted().update.refreshCredential)).toBe(grant.refreshCredential);
  });

  it("upsertConnection stores the expiry and the last known handle as they were handed over, so a caller renews ahead of a post and the panel shows the account that connected", async () => {
    await upsertConnection(token, grant);

    expect(upserted().create.accessExpiresAt).toBe(grant.accessExpiresAt);
    expect(upserted().create.xUsername).toBe(grant.xUsername);
  });

  it("upsertConnection records no wallet and no consent version, because the creator is on chain and a denormalised version is what would let a version bump fail to bite", async () => {
    await upsertConnection(token, grant);

    expect(Object.keys(upserted().create).sort()).toEqual([
      "accessCredential",
      "accessExpiresAt",
      "confirmedAt",
      "refreshCredential",
      "token",
      "xUserId",
      "xUsername",
    ]);
  });

  it("findConnectionByXUserId looks up the account's permanent identifier at X rather than its handle, because a creator may rename the account and it is still the same account", async () => {
    await findConnectionByXUserId(xUserId);

    expect(prismaMock.connection.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { xUserId } }),
    );
  });

  it("findConnectionByXUserId reads the token alone, so no credential leaves this tier to answer whether an account is taken", async () => {
    await findConnectionByXUserId(xUserId);

    expect(vi.mocked(prismaMock.connection.findUnique).mock.calls[0][0].select).toEqual({
      token: true,
    });
  });
});

describe("connections.repo, ending a connection", () => {
  it("deleteConnectionByToken deletes by the token and does not raise when the row is already gone, so one agent ends its own connection and a second disconnect, or one racing a renewal that found the grant gone, is never a server error", async () => {
    await deleteConnectionByToken(token);

    expect(prismaMock.connection.deleteMany).toHaveBeenCalledWith({ where: { token } });
    expect(prismaMock.connection.delete).not.toHaveBeenCalled();
  });

  it("deleteConnectionByToken touches the connection alone, so the persona, the topics, the pace, the pause, the admin stop and the consent history all outlive a disconnect", async () => {
    await deleteConnectionByToken(token);

    expect(prismaMock.agent.delete).not.toHaveBeenCalled();
    expect(prismaMock.agent.update).not.toHaveBeenCalled();
    expect(prismaMock.consent.delete).not.toHaveBeenCalled();
    expect(prismaMock.consent.deleteMany).not.toHaveBeenCalled();
  });

  it("findRefreshCredentialByToken opens the sealed credential, because X is handed back the credential it issued rather than the ciphertext Postgres holds", async () => {
    vi.mocked(prismaMock.connection.findUnique).mockResolvedValue({
      refreshCredential: encrypt(grant.refreshCredential),
    });

    await expect(findRefreshCredentialByToken(token)).resolves.toBe(
      grant.refreshCredential,
    );
  });

  it("findRefreshCredentialByToken reads the refresh credential alone, so no credential a disconnect has no use for leaves this tier", async () => {
    await findRefreshCredentialByToken(token);

    expect(prismaMock.connection.findUnique).toHaveBeenCalledWith({
      where: { token },
      select: { refreshCredential: true },
    });
  });

  it("findRefreshCredentialByToken answers nothing for a token that is not connected, so a caller can tell a connection from one that is already gone", async () => {
    vi.mocked(prismaMock.connection.findUnique).mockResolvedValue(null);

    await expect(findRefreshCredentialByToken(token)).resolves.toBeNull();
  });
});

const sealedPair = () => ({
  accessCredential: encrypt(grant.accessCredential),
  refreshCredential: encrypt(grant.refreshCredential),
  accessExpiresAt: grant.accessExpiresAt,
});

const renewed = {
  accessCredential: "the-access-credential-the-renewal-issued",
  refreshCredential: "the-refresh-credential-the-renewal-issued",
  accessExpiresAt: new Date("2026-05-01T13:00:00.000Z"),
};

const updated = () => vi.mocked(prismaMock.connection.update).mock.calls[0][0];

describe("connections.repo, keeping a connection alive", () => {
  it("findCredentialsByToken reads the pair and the expiry alone, so no handle and no attestation leaves this tier to answer a renewal", async () => {
    vi.mocked(prismaMock.connection.findUnique).mockResolvedValue(sealedPair());

    await findCredentialsByToken(token);

    expect(prismaMock.connection.findUnique).toHaveBeenCalledWith({
      where: { token },
      select: {
        accessCredential: true,
        refreshCredential: true,
        accessExpiresAt: true,
      },
    });
  });

  it("findCredentialsByToken opens both sealed credentials, because a caller can neither publish nor renew with the ciphertext Postgres holds", async () => {
    vi.mocked(prismaMock.connection.findUnique).mockResolvedValue(sealedPair());

    await expect(findCredentialsByToken(token)).resolves.toEqual({
      accessCredential: grant.accessCredential,
      refreshCredential: grant.refreshCredential,
      accessExpiresAt: grant.accessExpiresAt,
    });
  });

  it("findCredentialsByToken answers nothing for a token that is not connected, so a caller can tell a connection from one that is already gone", async () => {
    vi.mocked(prismaMock.connection.findUnique).mockResolvedValue(null);

    await expect(findCredentialsByToken(token)).resolves.toBeNull();
  });

  it("updateConnectionCredentials seals the renewed pair too, so the rotation that keeps an agent alive for months never lands a plaintext credential in the row", async () => {
    await updateConnectionCredentials(token, renewed);

    expect(updated().where).toEqual({ token });
    expect(updated().data.accessCredential).not.toBe(renewed.accessCredential);
    expect(decrypt(updated().data.accessCredential)).toBe(renewed.accessCredential);
    expect(decrypt(updated().data.refreshCredential)).toBe(renewed.refreshCredential);
  });

  it("updateConnectionCredentials writes both halves and the new expiry in one statement, because X kills the old pair the same second it issues the new one", async () => {
    await updateConnectionCredentials(token, renewed);

    expect(Object.keys(updated().data).sort()).toEqual([
      "accessCredential",
      "accessExpiresAt",
      "refreshCredential",
    ]);
    expect(updated().data.accessExpiresAt).toBe(renewed.accessExpiresAt);
  });

  it("updateConnectionCredentials updates rather than upserts, so a renewal racing a disconnect never writes the row the creator has just deleted back", async () => {
    await updateConnectionCredentials(token, renewed);

    expect(prismaMock.connection.upsert).not.toHaveBeenCalled();
    expect(prismaMock.connection.create).not.toHaveBeenCalled();
  });
});

const confirmedAt = new Date("2026-05-01T09:00:00.000Z");

const attested = () => vi.mocked(prismaMock.connection.updateMany).mock.calls[0][0];

describe("connections.repo, finishing a connection", () => {
  it("findConnectionByToken reads the last known handle and the attestation alone, so no credential leaves this tier to answer a panel read", async () => {
    await findConnectionByToken(token);

    expect(prismaMock.connection.findUnique).toHaveBeenCalledWith({
      where: { token },
      select: { xUsername: true, confirmedAt: true },
    });
  });

  it("findConnectionByToken looks up the token it was handed, so one creator's connection never answers for another token", async () => {
    await findConnectionByToken(other);

    expect(prismaMock.connection.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: other } }),
    );
  });

  it("updateConnectionAttestation writes the time it was handed against the token it was handed, so the clock stays with the rule in the domain", async () => {
    await updateConnectionAttestation(token, confirmedAt);

    expect(prismaMock.connection.updateMany).toHaveBeenCalledWith({
      where: { token },
      data: { confirmedAt, updatedAt: confirmedAt },
    });
  });

  it("updateConnectionAttestation touches the attestation and its own updatedAt, which a bulk write never stamps by itself, so confirming never disturbs the credentials or the handle", async () => {
    await updateConnectionAttestation(token, confirmedAt);

    expect(Object.keys(attested().data)).toEqual(["confirmedAt", "updatedAt"]);
  });

  it("updateConnectionAttestation counts rather than raising when the row is gone, so a confirmation racing a disconnect is a refusal the caller can word rather than a server error", async () => {
    await updateConnectionAttestation(token, confirmedAt);

    expect(prismaMock.connection.update).not.toHaveBeenCalled();
    expect(prismaMock.connection.upsert).not.toHaveBeenCalled();
    expect(prismaMock.connection.create).not.toHaveBeenCalled();
  });
});
