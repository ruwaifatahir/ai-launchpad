import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { DEFAULT_CODES } from "@/shared/errors/api-error";
import { swaggerSpec } from "@/config/swagger";

type Response = { content?: Record<string, { schema?: unknown }>; $ref?: string };
type Operation = {
  operationId?: string;
  tags?: string[];
  summary?: string;
  security?: unknown[];
  responses: Record<string, Response>;
};

const METHODS = ["get", "put", "post", "patch", "delete"] as const;

const operations = () =>
  Object.entries(swaggerSpec.paths as Record<string, Record<string, Operation>>).flatMap(
    ([path, item]) =>
      METHODS.filter((method) => item[method]).map((method) => ({
        name: `${method.toUpperCase()} ${path}`,
        operation: item[method] as Operation,
      })),
  );

// Routes a caller reaches with no credential, on purpose. Anything else missing a
// security requirement is a route documented as open that the code guards, or worse.
const PUBLIC = new Set([
  "GET /",
  "GET /api/v1/core/health",
  "GET /api/v1/auth/sessions/nonce",
  "POST /api/v1/auth/sessions",
  "GET /api/v1/core/connections/callback",
  "GET /api/v1/market/tokens/{token}/trades",
  "GET /api/v1/market/tokens/{token}/chart",
  "GET /api/v1/market/tokens/{token}/holders",
  "GET /api/v1/market/tokens/graduated",
  "GET /api/v1/market/tokens/explore",
  "GET /api/v1/market/tokens/search",
  "GET /api/v1/market/creators/{creator}/tokens",
  "GET /api/v1/market/quote-assets",
  "GET /api/v1/market/analytics",
]);

describe("the OpenAPI document", () => {
  it("is a valid OpenAPI 3.1 document with every $ref resolving, which is what lets a client generator read it", async () => {
    const copy = structuredClone(swaggerSpec);

    await expect(SwaggerParser.validate(copy)).resolves.toBeDefined();
    expect(swaggerSpec.openapi).toBe("3.1.0");
  });

  it("names the product rather than the template it grew from", () => {
    expect(swaggerSpec.info.title).toBe("AI Launchpad API");
  });

  it("gives every operation a unique operationId, which is the method name a generated client exposes", () => {
    const ids = operations().map(({ operation }) => operation.operationId);

    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tags and summarises every operation, with a tag the document declares", () => {
    const declared = new Set(
      (swaggerSpec.tags as { name: string }[]).map((tag) => tag.name),
    );

    for (const { name, operation } of operations()) {
      expect(operation.summary, name).toBeTruthy();
      expect(operation.tags?.length, name).toBeGreaterThan(0);
      for (const tag of operation.tags ?? []) expect(declared.has(tag), name).toBe(true);
    }
  });

  it("types the body of every successful JSON response, so a client knows what data holds", () => {
    for (const { name, operation } of operations()) {
      const success = Object.entries(operation.responses).filter(([status]) =>
        status.startsWith("2"),
      );

      if (name === "GET /api/v1/core/connections/callback") continue; // a 302 only

      expect(success.length, name).toBeGreaterThan(0);
      for (const [, response] of success)
        expect(response.content?.["application/json"]?.schema, name).toBeDefined();
    }
  });

  it("gives every failure the one error body and documents the 500 every route can answer", () => {
    for (const { name, operation } of operations()) {
      expect(operation.responses["500"], name).toBeDefined();

      for (const [status, response] of Object.entries(operation.responses)) {
        if (Number(status) < 400) continue;
        expect(
          response.content?.["application/json"]?.schema,
          `${name} ${status}`,
        ).toEqual({
          $ref: "#/components/schemas/ErrorResponse",
        });
      }
    }
  });

  it("lists every error code the source can send, so a code never ships undocumented", () => {
    const sources = ["src/features", "src/middleware", "src/shared"].flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: "utf8" })
        .filter((file) => file.endsWith(".ts"))
        .map((file) => readFileSync(join(dir, file), "utf8")),
    );
    const generic = new Set(Object.values(DEFAULT_CODES));
    const sent = sources.flatMap((source) =>
      [...source.matchAll(/"([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)"/g)].map((match) => match[1]),
    );

    expect(sent.length).toBeGreaterThan(0);

    for (const code of new Set(sent)) {
      if (generic.has(code)) continue;
      expect(swaggerSpec.info.description, code).toContain("`" + code + "`");
    }
  });

  it("requires a credential on every route that is not public by design", () => {
    for (const { name, operation } of operations()) {
      if (PUBLIC.has(name)) continue;
      expect(operation.security?.length, name).toBeGreaterThan(0);
    }
  });
});
