import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "@/app";

describe("app", () => {
  it("GET / answers 200, so a load balancer health check passes without a database", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "API is running", version: "v1" });
  });

  it("an unknown path is a 404 from notFoundHandler naming the method and the url, never an empty 404 from express", async () => {
    const res = await request(app).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Route not found: GET /nope");
  });

  it("grants a configured panel origin cross origin access, which is what lets the panel call the API at all", async () => {
    const res = await request(app).get("/").set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("grants no origin outside PANEL_ORIGINS, so the API never reflects whatever origin asked", async () => {
    const res = await request(app).get("/").set("Origin", "https://evil.example");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("serves the generated OpenAPI document, which is what proves the @openapi blocks parse", async () => {
    const res = await request(app).get("/api-docs.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    expect(Object.keys(res.body.paths)).toContain("/api/v1/core/health");
  });

  it("documents every agent route by method, which is what proves each @openapi block parses, including the one holding the publishing precedence", async () => {
    const res = await request(app).get("/api-docs.json");

    expect(res.body.paths["/api/v1/core/agents/{token}"]).toEqual(
      expect.objectContaining({ get: expect.anything(), patch: expect.anything() }),
    );
    expect(res.body.paths["/api/v1/core/agents/{token}/pause"]).toEqual(
      expect.objectContaining({ put: expect.anything() }),
    );
    expect(res.body.paths["/api/v1/core/agents/{token}/admin/stop"]).toEqual(
      expect.objectContaining({ put: expect.anything() }),
    );
  });

  it("documents the token address once and points every agent route at it, because a copy per route is what let the rule drift in the first place", async () => {
    const res = await request(app).get("/api-docs.json");

    expect(res.body.components.parameters.TokenAddress).toEqual(
      expect.objectContaining({ in: "path", name: "token", required: true }),
    );

    const ref = [{ $ref: "#/components/parameters/TokenAddress" }];

    expect(res.body.paths["/api/v1/core/agents/{token}"].get.parameters).toEqual(ref);
    expect(res.body.paths["/api/v1/core/agents/{token}"].patch.parameters).toEqual(ref);
    expect(res.body.paths["/api/v1/core/agents/{token}/pause"].put.parameters).toEqual(
      ref,
    );
    expect(
      res.body.paths["/api/v1/core/agents/{token}/admin/stop"].put.parameters,
    ).toEqual(ref);
  });

  it("points every market route at the shared token address, and the paged ones at the shared page", async () => {
    const res = await request(app).get("/api-docs.json");
    const paths = res.body.paths;
    const address = { $ref: "#/components/parameters/TokenAddress" };
    const page = { $ref: "#/components/parameters/Page" };

    expect(res.body.components.parameters.Page).toEqual(
      expect.objectContaining({ in: "query", name: "page", required: false }),
    );
    expect(paths["/api/v1/market/tokens/{token}/trades"].get.parameters).toEqual([
      address,
      page,
    ]);
    expect(paths["/api/v1/market/tokens/{token}/holders"].get.parameters).toEqual([
      address,
      page,
    ]);
    expect(paths["/api/v1/market/tokens/{token}/chart"].get.parameters[0]).toEqual(
      address,
    );
  });

  it("documents every connection route by method, which is what proves each @openapi block parses", async () => {
    const res = await request(app).get("/api-docs.json");

    expect(res.body.paths["/api/v1/core/connections/{token}/consent"]).toEqual(
      expect.objectContaining({ get: expect.anything(), post: expect.anything() }),
    );
    expect(res.body.paths["/api/v1/core/connections/{token}/authorization"]).toEqual(
      expect.objectContaining({ post: expect.anything() }),
    );
    expect(res.body.paths["/api/v1/core/connections/{token}/attestation"]).toEqual(
      expect.objectContaining({ put: expect.anything() }),
    );
    expect(res.body.paths["/api/v1/core/connections/{token}"]).toEqual(
      expect.objectContaining({ get: expect.anything() }),
    );
  });

  it("routes the callback X is registered against to the callback rather than to the connection read, whose path parameter would otherwise swallow it and answer a creator's browser with a 401", async () => {
    const res = await request(app).get("/api/v1/core/connections/callback");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/connect/x?status=failure&reason=error");
  });

  it("documents all three session routes, which is what proves each @openapi block parses", async () => {
    const res = await request(app).get("/api-docs.json");

    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        "/api/v1/auth/sessions/nonce",
        "/api/v1/auth/sessions",
        "/api/v1/auth/sessions/current",
      ]),
    );
  });

  it("sets the security headers helmet owns and hides the framework, so a response advertises nothing an attacker can use", async () => {
    const res = await request(app).get("/");

    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  it("answers a body that is not JSON with a 400 naming the problem, never the 500 an unrecognised parser error would become", async () => {
    const res = await request(app)
      .post("/api/v1/auth/sessions")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: "MALFORMED_JSON" });
  });

  it("refuses a body far larger than any route accepts with a 413, before any handler reads it", async () => {
    const res = await request(app)
      .post("/api/v1/auth/sessions")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ message: "x".repeat(200_000), signature: "0x00" }));

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("puts a code and the request id on every failure, so a client branches on the code and a support request quotes the id", async () => {
    const res = await request(app).get("/nope").set("x-request-id", "trace-123");

    expect(res.body).toMatchObject({ code: "ROUTE_NOT_FOUND", requestId: "trace-123" });
    expect(res.headers["x-request-id"]).toBe("trace-123");
  });

  it("names each rejected field in errors, so a form can mark the field rather than parse the message", async () => {
    const res = await request(app).post("/api/v1/auth/sessions").send({ message: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "body.signature" })]),
    );
  });

  it("replaces a request id carrying anything but safe characters, so a caller cannot write newlines into the logs", async () => {
    const res = await request(app).get("/").set("x-request-id", "evil	forged line");

    expect(res.headers["x-request-id"]).not.toContain("evil");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
