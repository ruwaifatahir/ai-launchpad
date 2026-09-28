import { Prisma } from "@prisma/client";
import prisma from "@/config/database";

const asDay = (day: Date) => day.toISOString().slice(0, 10);

export const incrementPreviewCount = async (token: string, day: Date) => {
  const [counted] = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "preview_usage" ("token", "day", "count")
    VALUES (${token}, ${asDay(day)}::date, 1)
    ON CONFLICT ("token", "day")
    DO UPDATE SET "count" = "preview_usage"."count" + 1
    RETURNING "count"
  `;

  return counted.count;
};

export const decrementPreviewCount = (token: string, day: Date) =>
  prisma.$executeRaw`
    UPDATE "preview_usage"
    SET "count" = "count" - 1
    WHERE "token" = ${token} AND "day" = ${asDay(day)}::date
  `;

export const addPreviewSpend = (
  token: string,
  day: Date,
  spend: { writerCost: number; inputTokens: number; outputTokens: number },
) =>
  prisma.$executeRaw`
    UPDATE "preview_usage"
    SET "writerCost" = "writerCost" + ${new Prisma.Decimal(spend.writerCost)},
        "inputTokens" = "inputTokens" + ${spend.inputTokens},
        "outputTokens" = "outputTokens" + ${spend.outputTokens}
    WHERE "token" = ${token} AND "day" = ${asDay(day)}::date
  `;

export const findPreviewCountByTokenAndDay = async (token: string, day: Date) => {
  const counted = await prisma.$queryRaw<{ count: number }[]>`
    SELECT "count"
    FROM "preview_usage"
    WHERE "token" = ${token} AND "day" = ${asDay(day)}::date
  `;

  return counted.at(0)?.count ?? null;
};
