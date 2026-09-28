import fs from "fs";
import path from "path";
import swaggerJsdoc from "swagger-jsdoc";
import { components } from "@/config/openapi/components";

// Every documented route lives in a *.routes.ts file (plus the liveness check in app.ts).
// Paths are relative to the project root, which is where pnpm scripts and Docker run from.
// Forward slashes: the glob matcher treats a backslash as an escape character, so a
// Windows-style path would match nothing.
const fromRoot = (pattern: string) =>
  path.join(process.cwd(), pattern).split(path.sep).join("/");

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.1.0",
    info: {
      title: "AI Launchpad API",
      version: "1.0.0",
      summary:
        "Market data, logos and an optional X agent for an on-chain token launchpad.",
      description: [
        "The API behind the AI Launchpad web app. Anyone reads the tokens, trades, charts and holders the indexer holds. A creator signs in with their wallet and stores a logo for a launch.",
        "",
        "**Agents.** Where the deployment turns agents on (AGENTS_ENABLED), a creator also writes a persona for their token's agent, connects an X account they own, and the agent publishes on its own at the pace they set. Where agents are off, the Agents, Connections and Previews routes answer 404 and are left out of this document.",
        "",
        "**Envelope.** Every success is `{ success: true, statusCode, message, data }`. Every failure is `{ success: false, statusCode, code, message, errors?, requestId? }`. Branch on `code`, never on `message`.",
        "",
        "**Auth.** Creator routes take the session credential as a bearer token. Every route that names a token also checks, on chain, that the session wallet launched it. Admin routes take `X-Admin-Key` instead. Market routes are public and take no credential.",
        "",
        "**Rate limits.** Every route but the health checks is rate limited. A 429 carries `Retry-After` and the `RateLimit-*` headers.",
        "",
        "**Error codes.** A status several rules share has a code per rule. Any other failure carries the generic code for its status.",
        "",
        "| Code | Status | Meaning |",
        "| --- | --- | --- |",
        "| `VALIDATION_ERROR` | 400 | A field failed validation. `errors` names each one. |",
        "| `MALFORMED_JSON` | 400 | The body is not valid JSON. |",
        "| `INVALID_TOKEN_ADDRESS` | 400 | The token in the path is not an address. |",
        "| `INVALID_ADMIN_KEY` | 401 | The admin key is missing or wrong. |",
        "| `NOT_TOKEN_CREATOR` | 403 | The session wallet did not launch this token. |",
        "| `TOKEN_NOT_FOUND` | 404 | The launchpad, or on a market route the indexer, does not know this token. |",
        "| `CONNECTION_NOT_FOUND` | 404 | No X account is connected to this token. |",
        "| `ROUTE_NOT_FOUND` | 404 | No route matches the method and path. |",
        "| `TOKEN_NOT_GRADUATED` | 409 | The token's pool has not opened. |",
        "| `AGENT_STOPPED` | 409 | An AI Launchpad admin stopped the agent. |",
        "| `PERSONA_INCOMPLETE` | 409 | The persona is missing one of its four parts. |",
        "| `CONSENT_REQUIRED` | 409 | The creator has not agreed to the automated actions. |",
        "| `CONSENT_OUTDATED` | 409 | The creator agreed to an older version. |",
        "| `CONSENT_VERSION_MISMATCH` | 409 | The version sent is not the current one. |",
        "| `CONNECTION_REQUIRED` | 409 | Connect an X account first. |",
        "| `UNIQUE_VIOLATION` | 409 | Two requests raced for the same record. |",
        "| `LOGO_REQUIRED` | 400 | Send one file, as multipart form data in a field named `file`. |",
        "| `PAYLOAD_TOO_LARGE` | 413 | The body is larger than any route accepts. |",
        "| `LOGO_TOO_LARGE` | 413 | The file is over 4 MB or 25 million pixels, counting every frame. |",
        "| `LOGO_NOT_AN_IMAGE` | 415 | The file is not a PNG, JPEG, WebP or GIF, or its pixels do not decode. |",
        "| `PREVIEW_ALLOWANCE_SPENT` | 429 | Every preview for today is taken. Resets at midnight UTC. |",
        "| `TOO_MANY_REQUESTS` | 429 | The rate limiter refused the request. |",
        "| `CHAIN_UNAVAILABLE` | 503 | The chain could not be read. Worth retrying. |",
        "| `INDEXER_UNAVAILABLE` | 503 | The indexer's database did not answer. Worth retrying. |",
        "| `INDEXER_BUSY` | 503 | Every connection to the indexer was taken. Retry after the `Retry-After` seconds. |",
        "| `WRITER_UNAVAILABLE` | 503 | The writer could not be reached. The preview was not spent. |",
        "| `LOGO_STORE_UNAVAILABLE` | 503 | The logo store could not be reached. Nothing was recorded. |",
      ].join("\n"),
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: "/", description: "The server serving this document" }],
    tags: [
      { name: "Auth", description: "Sign in with Ethereum and the session it opens" },
      { name: "Health", description: "Liveness and readiness" },
      { name: "Agents", description: "The autonomous poster that belongs to a token" },
      {
        name: "Connections",
        description: "The link between an agent and the X account it posts from",
      },
      {
        name: "Previews",
        description: "A post written for the creator to read, and sent nowhere",
      },
      {
        name: "Logos",
        description:
          "What a token shows beside its name, stored before the launch writes it on chain",
      },
      {
        name: "Market",
        description: "Tokens and their trades, read from the indexer, for anyone to see",
      },
    ],
    components,
  },
  apis: [fromRoot("src/app.ts"), fromRoot("src/features/**/*.routes.ts")],
};

type Operation = {
  operationId?: string;
  tags?: string[];
  responses?: Record<
    string,
    { description?: string; content?: unknown; headers?: unknown }
  >;
};

type Spec = { paths?: Record<string, Record<string, Operation>> };

const METHODS = new Set(["get", "put", "post", "patch", "delete", "head", "options"]);

const errorContent = {
  "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
};

const retryAfter = {
  "Retry-After": {
    description: "Seconds until the limit resets",
    schema: { type: "integer" },
  },
};

// Every failure leaves this API in one shape, so the route blocks describe what each
// status means for that route and this pass attaches the shape. It also documents the
// 500 every route can answer, and the Retry-After header every 429 carries, without a
// copy of either in each block.
export const normalize = <T extends Spec>(spec: T): T => {
  for (const item of Object.values(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (!METHODS.has(method) || !operation.responses) continue;

      const responses = operation.responses;

      for (const [status, response] of Object.entries(responses)) {
        if (Number(status) < 400 || "$ref" in response || response.content) continue;
        response.content = errorContent;
        if (status === "429") response.headers = retryAfter;
      }

      responses["500"] ??= {
        description: "A fault of ours. Quote the requestId.",
        content: errorContent,
      };
    }
  }

  return spec;
};

// The document without the operations under any of the given tags, and without those
// tags, for a deployment that does not mount their routes. The spec itself is left as
// it is.
export const withoutTags = <T extends Spec & { tags?: { name: string }[] }>(
  spec: T,
  tags: string[],
): T => {
  const dropped = new Set(tags);
  const paths: Record<string, Record<string, Operation>> = {};

  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    const kept = Object.fromEntries(
      Object.entries(item).filter(
        ([method, operation]) =>
          !METHODS.has(method) || !operation.tags?.some((tag) => dropped.has(tag)),
      ),
    );

    if (Object.keys(kept).some((method) => METHODS.has(method))) paths[path] = kept;
  }

  return {
    ...spec,
    paths,
    tags: spec.tags?.filter((tag) => !dropped.has(tag.name)),
  };
};

// swagger-jsdoc parses the TypeScript sources at call time, and the runtime image ships
// dist/ without src/, so the same call there yields a spec with the tags but no paths at
// all. openapi.gen.ts writes openapi.json in the build stage, while src/ is still there,
// and the image carries that file. Source wins wherever it exists, so a checkout never
// serves an artifact that has fallen behind the routes.
const readGeneratedSpec = () => {
  const file = fromRoot("openapi.json");

  if (!fs.existsSync(file)) {
    throw new Error(
      "No src/ to parse and no openapi.json to serve. The build must run `pnpm openapi:generate` before it drops the sources.",
    );
  }

  return JSON.parse(fs.readFileSync(file, "utf8"));
};

export const swaggerSpec = fs.existsSync(fromRoot("src"))
  ? normalize(swaggerJsdoc(swaggerOptions) as Spec)
  : readGeneratedSpec();
