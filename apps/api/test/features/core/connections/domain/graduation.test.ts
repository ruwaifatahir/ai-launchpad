import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));

import { readTokenGraduation } from "@/features/core/graduations/reading";
import { requireGraduation } from "@/features/core/connections/domain/graduation";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;

describe("requireGraduation", () => {
  it("lets a graduated token through", async () => {
    vi.mocked(readTokenGraduation).mockResolvedValueOnce(new Date("2026-01-01"));

    await expect(requireGraduation(token)).resolves.toBeUndefined();
  });

  it("refuses a token whose pool has not opened with a 409 the panel can branch on", async () => {
    vi.mocked(readTokenGraduation).mockResolvedValueOnce(null);

    await expect(requireGraduation(token)).rejects.toMatchObject({
      statusCode: 409,
      code: "TOKEN_NOT_GRADUATED",
    });
  });

  it("lets an indexer failure through untouched, so an outage is never read as a locked token", async () => {
    vi.mocked(readTokenGraduation).mockRejectedValueOnce(new Error("indexer down"));

    await expect(requireGraduation(token)).rejects.toThrow("indexer down");
  });
});
