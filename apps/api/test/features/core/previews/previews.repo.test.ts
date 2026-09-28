import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";

import {
  addPreviewSpend,
  decrementPreviewCount,
  findPreviewCountByTokenAndDay,
  incrementPreviewCount,
} from "@/features/core/previews/previews.repo";
import { prismaMock } from "@test/helpers/prisma.mock";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e";
const day = new Date("2026-09-19T00:00:00.000Z");

const readSql = () =>
  (prismaMock.$queryRaw.mock.calls[0][0] as string[]).join("?").replace(/\s+/g, " ");

const writeSql = () =>
  (prismaMock.$executeRaw.mock.calls[0][0] as string[]).join("?").replace(/\s+/g, " ");

const spend = { writerCost: 0.0003, inputTokens: 500, outputTokens: 100 };

describe("previews.repo", () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockResolvedValue([{ count: 1 }]);
  });

  it("incrementPreviewCount takes the day's allowance in a single insert on conflict, so two requests arriving together cannot both take the last preview", async () => {
    await incrementPreviewCount(token, day);

    expect(readSql()).toContain('INSERT INTO "preview_usage"');
    expect(readSql()).toContain('ON CONFLICT ("token", "day") DO UPDATE');
  });

  it("incrementPreviewCount adds to the value the row already holds rather than one it read first, which is what makes the claim atomic", async () => {
    await incrementPreviewCount(token, day);

    expect(readSql()).toContain('SET "count" = "preview_usage"."count" + 1');
  });

  it("incrementPreviewCount returns the count the statement wrote, so the caller learns whether its own claim went over the allowance", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ count: 7 }]);

    expect(await incrementPreviewCount(token, day)).toBe(7);
  });

  it("incrementPreviewCount starts a fresh day at one, so the first preview of the day is counted rather than free", async () => {
    await incrementPreviewCount(token, day);

    expect(readSql()).toContain("VALUES (?, ?::date, 1)");
  });

  it("decrementPreviewCount gives one back by subtracting from the stored count, so a preview that produced nothing costs the creator nothing", async () => {
    await decrementPreviewCount(token, day);

    expect(writeSql()).toContain('SET "count" = "count" - 1');
    expect(writeSql()).toContain('WHERE "token" = ? AND "day" = ?::date');
  });

  it("addPreviewSpend adds to what the day already holds rather than replacing it, so the meter totals every preview instead of the last one", async () => {
    await addPreviewSpend(token, day, spend);

    expect(writeSql()).toContain('"writerCost" = "writerCost" + ?');
    expect(writeSql()).toContain('"inputTokens" = "inputTokens" + ?');
    expect(writeSql()).toContain('"outputTokens" = "outputTokens" + ?');
  });

  it("addPreviewSpend binds the cost as a decimal, so eight places reach a numeric column instead of a float", async () => {
    await addPreviewSpend(token, day, { ...spend, writerCost: 0.0003125 });

    expect(prismaMock.$executeRaw.mock.calls[0][1]).toBeInstanceOf(Prisma.Decimal);
    expect(String(prismaMock.$executeRaw.mock.calls[0][1])).toBe("0.0003125");
  });

  it("addPreviewSpend never touches the count, because recording what a preview cost is not the same as handing one back", async () => {
    await addPreviewSpend(token, day, spend);

    expect(writeSql()).not.toContain('"count" =');
  });

  it("addPreviewSpend stores no text, because a preview reaches one human who is looking at it and no later reader can ask what it said", async () => {
    await addPreviewSpend(token, day, spend);

    expect(writeSql()).not.toContain("text");
  });

  it("findPreviewCountByTokenAndDay reads the count for one token on one day, which is the whole key", async () => {
    await findPreviewCountByTokenAndDay(token, day);

    expect(readSql()).toContain('SELECT "count" FROM "preview_usage"');
    expect(readSql()).toContain('WHERE "token" = ? AND "day" = ?::date');
  });

  it("findPreviewCountByTokenAndDay answers null for a day with no row, so an agent that has taken none reads as untouched rather than as zero left", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    expect(await findPreviewCountByTokenAndDay(token, day)).toBeNull();
  });

  it("every statement binds the day as a bare date, so the read and the write cannot disagree about which UTC day a row belongs to", async () => {
    await incrementPreviewCount(token, day);
    await findPreviewCountByTokenAndDay(token, day);
    await decrementPreviewCount(token, day);
    await addPreviewSpend(token, day, spend);

    for (const call of [
      ...prismaMock.$queryRaw.mock.calls,
      ...prismaMock.$executeRaw.mock.calls,
    ])
      expect(call).toContain("2026-09-19");
  });
});
