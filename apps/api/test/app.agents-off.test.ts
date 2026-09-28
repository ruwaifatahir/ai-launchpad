import { describe, expect, it, vi } from "vitest";
import request from "supertest";

// The app as a deployment with AGENTS_ENABLED off builds it. The shared mock has it on,
// so this file mocks the module again with the one switch flipped.
vi.mock("@/config/env", async () => {
  const { TEST_ENV } = await import("@test/helpers/env.mock");

  return { env: { ...TEST_ENV, AGENTS_ENABLED: false } };
});

import app from "@/app";

const TOKEN = "0x0ae6ab900fc7f3be5bd9f5137827fa99200373f7";

describe("app, with agents off", () => {
  it.each([
    ["get", `/api/v1/core/agents/${TOKEN}`],
    ["patch", `/api/v1/core/agents/${TOKEN}`],
    ["put", `/api/v1/core/agents/${TOKEN}/pause`],
    ["put", `/api/v1/core/agents/${TOKEN}/admin/stop`],
    ["get", `/api/v1/core/connections/${TOKEN}`],
    ["get", "/api/v1/core/connections/callback"],
    ["post", `/api/v1/core/connections/${TOKEN}/authorization`],
    ["post", `/api/v1/core/previews/${TOKEN}`],
    ["get", `/api/v1/core/previews/${TOKEN}/allowance`],
  ] as const)(
    "answers %s %s with the 404 every unknown path gets",
    async (method, path) => {
      const res = await request(app)[method](path);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ROUTE_NOT_FOUND");
    },
  );

  it("still mounts sign in and logos, which a launch needs whether or not it has an agent", async () => {
    const signIn = await request(app).post("/api/v1/auth/sessions").send({});
    const logo = await request(app).post("/api/v1/core/logos");

    expect(signIn.status).toBe(400);
    expect(logo.status).toBe(401);
  });

  it("leaves the agent routes and their tags out of the document, so the docs describe only what answers", async () => {
    const res = await request(app).get("/api-docs.json");
    const paths = Object.keys(res.body.paths);
    const tags = res.body.tags.map((tag: { name: string }) => tag.name);

    for (const prefix of ["agents", "connections", "previews"])
      expect(paths.some((path) => path.startsWith(`/api/v1/core/${prefix}`))).toBe(false);

    expect(tags).not.toEqual(expect.arrayContaining(["Agents"]));
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/v1/core/health",
        "/api/v1/core/logos",
        "/api/v1/auth/sessions",
        "/api/v1/market/tokens/explore",
      ]),
    );
  });
});
