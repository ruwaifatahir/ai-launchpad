import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import type { Address } from "viem";

import { readTokenGraduation } from "@/features/core/graduations/reading";
import { endIndexer } from "@/lib/indexer/client";
import {
  GRADUATED,
  SWEPT,
  UNKNOWN,
  adminPool,
  deployIndexer,
  dropIndexer,
  ensureDatabase,
} from "@test/e2e/_helpers/indexer";

// The graduation read is SQL over the indexer's views, so this suite is where it is
// proved. The seed opens GRADUATED's pool at unix second 1500. SWEPT's curve
// has closed but its pool has not opened. UNKNOWN has no launch row at all.

let db: pg.Pool;

beforeAll(async () => {
  await ensureDatabase();
  db = adminPool();
  await dropIndexer(db);
  await deployIndexer(db, "e2e1601");
});

afterAll(async () => {
  await dropIndexer(db);
  await db.end();
  await endIndexer();
});

describe("reading a token's graduation from the indexer", () => {
  it("returns the time the pool opened for a graduated token", async () => {
    await expect(readTokenGraduation(GRADUATED as Address)).resolves.toEqual(
      new Date(1500 * 1000),
    );
  });

  it("returns null for a token whose curve closed but whose pool has not opened", async () => {
    await expect(readTokenGraduation(SWEPT as Address)).resolves.toBeNull();
  });

  it("returns null for a token the indexer holds no launch for", async () => {
    await expect(readTokenGraduation(UNKNOWN as Address)).resolves.toBeNull();
  });
});
