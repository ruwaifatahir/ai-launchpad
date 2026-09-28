import { describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@/features/core/health/readiness", () => ({ checkReadiness: vi.fn() }));

import app from "@/app";
import { ApiError } from "@/shared";
import { checkReadiness } from "@/features/core/health/readiness";

describe("GET /api/v1/core/health", () => {
  it("answers 200 in the shared envelope when both dependencies are up", async () => {
    vi.mocked(checkReadiness).mockResolvedValue({ database: "up", redis: "up" });

    const res = await request(app).get("/api/v1/core/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ database: "up", redis: "up" });
  });

  it("answers 503 carrying the message that names the silent dependency, so a container check fails on a dead database", async () => {
    vi.mocked(checkReadiness).mockRejectedValue(
      ApiError.unavailable("The database did not answer."),
    );

    const res = await request(app).get("/api/v1/core/health");

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("The database did not answer.");
  });

  it("is a different endpoint from GET /, which answers 200 without probing anything and so cannot stand in for this one", async () => {
    vi.mocked(checkReadiness).mockRejectedValue(
      ApiError.unavailable("The database did not answer."),
    );

    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(checkReadiness).not.toHaveBeenCalled();
  });
});
