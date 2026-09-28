import { Prisma } from "@prisma/client";
import prisma from "@/config/database";
import { decrypt, encrypt } from "@/lib/encryption/cipher";

export const createConsent = (
  token: string,
  data: Omit<Prisma.ConsentCreateInput, "token">,
) => prisma.consent.create({ data: { token, ...data } });

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export const upsertConnection = async (
  token: string,
  data: Omit<Prisma.ConnectionCreateInput, "token">,
) => {
  const sealed = {
    ...data,
    accessCredential: encrypt(data.accessCredential),
    refreshCredential: encrypt(data.refreshCredential),
  };

  try {
    return await prisma.connection.upsert({
      where: { token },
      create: { token, ...sealed },
      update: sealed,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
};

export const updateConnectionAttestation = (token: string, confirmedAt: Date) =>
  prisma.connection.updateMany({
    where: { token },
    data: { confirmedAt, updatedAt: confirmedAt },
  });

export const updateConnectionCredentials = (
  token: string,
  grant: Pick<
    Prisma.ConnectionCreateInput,
    "accessCredential" | "refreshCredential" | "accessExpiresAt"
  >,
) =>
  prisma.connection.update({
    where: { token },
    data: {
      accessCredential: encrypt(grant.accessCredential),
      refreshCredential: encrypt(grant.refreshCredential),
      accessExpiresAt: grant.accessExpiresAt,
    },
  });

export const deleteConnectionByToken = (token: string) =>
  prisma.connection.deleteMany({ where: { token } });

export const findLatestConsentByToken = (token: string) =>
  prisma.consent.findFirst({ where: { token }, orderBy: { agreedAt: "desc" } });

export const findConnectionByToken = (token: string) =>
  prisma.connection.findUnique({
    where: { token },
    select: { xUsername: true, confirmedAt: true },
  });

export const findConnectionByXUserId = (xUserId: string) =>
  prisma.connection.findUnique({ where: { xUserId }, select: { token: true } });

export const findCredentialsByToken = async (token: string) => {
  const connection = await prisma.connection.findUnique({
    where: { token },
    select: {
      accessCredential: true,
      refreshCredential: true,
      accessExpiresAt: true,
    },
  });

  return connection
    ? {
        accessCredential: decrypt(connection.accessCredential),
        refreshCredential: decrypt(connection.refreshCredential),
        accessExpiresAt: connection.accessExpiresAt,
      }
    : null;
};

export const findRefreshCredentialByToken = async (token: string) => {
  const connection = await prisma.connection.findUnique({
    where: { token },
    select: { refreshCredential: true },
  });

  return connection ? decrypt(connection.refreshCredential) : null;
};
