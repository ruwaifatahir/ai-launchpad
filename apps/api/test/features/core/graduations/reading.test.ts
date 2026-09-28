import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/graduations/graduations.repo", () => ({
  findGraduationByToken: vi.fn(),
}));

import { findGraduationByToken } from "@/features/core/graduations/graduations.repo";
import { readTokenGraduation } from "@/features/core/graduations/reading";
import { IndexerUnreachableError } from "@/lib/indexer/client";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;

describe("readTokenGraduation", () => {
  it("returns the time the pool opened, read from the indexer's unix seconds", async () => {
    vi.mocked(findGraduationByToken).mockResolvedValue({ graduatedAt: "1790318275" });

    await expect(readTokenGraduation(token)).resolves.toEqual(
      new Date("2026-09-25T06:37:55.000Z"),
    );
    expect(findGraduationByToken).toHaveBeenCalledWith(token);
  });

  it("returns null for a token whose pool has not opened, or that the indexer has not reached yet, so its agent stays locked", async () => {
    vi.mocked(findGraduationByToken).mockResolvedValue(null);

    await expect(readTokenGraduation(token)).resolves.toBeNull();
  });

  it("lets an indexer failure through, so an outage is never read as a locked agent", async () => {
    const failure = new IndexerUnreachableError(new Error("ECONNREFUSED"));
    vi.mocked(findGraduationByToken).mockRejectedValue(failure);

    await expect(readTokenGraduation(token)).rejects.toBe(failure);
  });
});
