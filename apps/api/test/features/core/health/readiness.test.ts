import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/health/data-model/health.repo", () => ({
  pingDatabase: vi.fn(),
}));
vi.mock("@/features/core/health/data-model/health.storage", () => ({
  pingRedis: vi.fn(),
}));
vi.mock("@/lib/indexer/client", () => ({ readIndexer: vi.fn() }));

import { checkReadiness } from "@/features/core/health/readiness";
import { pingDatabase } from "@/features/core/health/data-model/health.repo";
import { pingRedis } from "@/features/core/health/data-model/health.storage";
import { readIndexer } from "@/lib/indexer/client";

const never = () => new Promise<never>(() => {}) as never;

describe("checkReadiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports both dependencies up when each one answers", async () => {
    vi.mocked(pingDatabase).mockResolvedValue([{ ok: 1 }]);
    vi.mocked(pingRedis).mockResolvedValue("PONG");

    await expect(checkReadiness()).resolves.toEqual({ database: "up", redis: "up" });
  });

  it("names the database when it is the only one that failed, so a 503 says which dependency to go and look at", async () => {
    vi.mocked(pingDatabase).mockRejectedValue(new Error("connection refused"));
    vi.mocked(pingRedis).mockResolvedValue("PONG");

    await expect(checkReadiness()).rejects.toThrow("The database did not answer.");
  });

  it("names Redis when it is the only one that failed", async () => {
    vi.mocked(pingDatabase).mockResolvedValue([{ ok: 1 }]);
    vi.mocked(pingRedis).mockRejectedValue(new Error("connection refused"));

    await expect(checkReadiness()).rejects.toThrow("Redis did not answer.");
  });

  it("names both when neither answered, rather than reporting only the first one checked", async () => {
    vi.mocked(pingDatabase).mockRejectedValue(new Error("connection refused"));
    vi.mocked(pingRedis).mockRejectedValue(new Error("connection refused"));

    await expect(checkReadiness()).rejects.toThrow(
      "The database and Redis did not answer.",
    );
  });

  it("abandons a probe that never settles, because the Redis client is built to queue a command forever rather than fail it", async () => {
    vi.mocked(pingDatabase).mockResolvedValue([{ ok: 1 }]);
    vi.mocked(pingRedis).mockReturnValue(never());

    const readiness = expect(checkReadiness()).rejects.toThrow("Redis did not answer.");
    await vi.advanceTimersByTimeAsync(2000);

    await readiness;
  });

  it("runs both probes inside one shared timeout window, so a dead database does not double the wait for a dead Redis", async () => {
    vi.mocked(pingDatabase).mockReturnValue(never());
    vi.mocked(pingRedis).mockReturnValue(never());

    const readiness = expect(checkReadiness()).rejects.toThrow(
      "The database and Redis did not answer.",
    );
    await vi.advanceTimersByTimeAsync(2000);

    await readiness;
  });

  it("never probes the indexer, so an indexer outage cannot fail a backend deploy", async () => {
    vi.mocked(pingDatabase).mockResolvedValue([{ ok: 1 }]);
    vi.mocked(pingRedis).mockResolvedValue("PONG");
    vi.mocked(readIndexer).mockRejectedValue(new Error("connection refused"));

    await expect(checkReadiness()).resolves.toEqual({ database: "up", redis: "up" });
    expect(readIndexer).not.toHaveBeenCalled();
  });
});
