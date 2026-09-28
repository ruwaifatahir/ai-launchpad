import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "@/config/env";
import { swaggerSpec, withoutTags } from "@/config/swagger";
import { errorHandler, notFoundHandler } from "@/shared";
import { requestContext } from "@/middleware/context";
import sessionRoutes from "@/features/auth/sessions/entry-point/sessions.routes";
import healthRoutes from "@/features/core/health/entry-point/health.routes";
import agentRoutes from "@/features/core/agents/entry-point/agents.routes";
import agentAdminRoutes from "@/features/core/agents/entry-point/agents.admin.routes";
import connectionRoutes from "@/features/core/connections/entry-point/connections.routes";
import connectionCallbackRoutes from "@/features/core/connections/entry-point/connections.callback.routes";
import previewRoutes from "@/features/core/previews/entry-point/previews.routes";
import logoRoutes from "@/features/core/logos/entry-point/logos.routes";
import analyticsRoutes from "@/features/market/analytics/entry-point/analytics.routes";
import chartRoutes from "@/features/market/chart/entry-point/chart.routes";
import holderRoutes from "@/features/market/holders/entry-point/holders.routes";
import quoteAssetRoutes from "@/features/market/quote-assets/entry-point/quote-assets.routes";
import tokenRoutes from "@/features/market/tokens/entry-point/tokens.routes";
import tradeRoutes from "@/features/market/trades/entry-point/trades.routes";

// The largest body any route accepts is a persona, a few kilobytes of text. Anything
// much bigger is refused by the parser with a 413 before a handler sees it.
const BODY_LIMIT = "100kb";

const app = express();

// The number of proxy hops whose X-Forwarded-For is believed. It decides req.ip, which
// is what the anonymous rate limits key on, so it is configured to the real topology
// rather than trusted wholesale.
app.set("trust proxy", env.TRUST_PROXY);

// Security headers, and no X-Powered-By. The default content security policy already
// suits /api-docs: swagger-ui loads its scripts from this origin and styles inline.
// upgrade-insecure-requests is sent only where the app is served over https. On a
// plain http localhost it would make the browser fetch the docs assets over https,
// where nothing answers.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: env.isDeployed ? [] : null },
    },
  }),
);

// An allowlist, never a reflection of whatever origin asked. credentials stays off
// because the session travels in the Authorization header and no cookie crosses.
app.use(cors({ origin: env.PANEL_ORIGINS, credentials: false }));

// Open the per-request context first, so every log line for this request
// (the access log and any rejection included) carries the same requestId.
app.use(requestContext);

app.use(express.json({ limit: BODY_LIMIT }));

/**
 * @openapi
 * /:
 *   get:
 *     tags: [Health]
 *     operationId: getRoot
 *     summary: Liveness check
 *     description: >
 *       A static reply that touches no dependency, so it answers whenever the process
 *       is up. Read /api/v1/core/health for whether Postgres and Redis answer.
 *     responses:
 *       200:
 *         description: The process is up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message, version]
 *               properties:
 *                 message:
 *                   type: string
 *                   examples: [API is running]
 *                 version:
 *                   type: string
 *                   examples: [v1]
 */
app.get("/", (_req, res) => {
  res.json({ message: "API is running", version: "v1" });
});

// The tags whose routes exist only while AGENTS_ENABLED is on. With it off they are left
// out of the document too, so the docs never describe a route that answers 404.
const AGENT_TAGS = ["Agents", "Connections", "Previews"];

const servedSpec = env.AGENTS_ENABLED
  ? swaggerSpec
  : withoutTags(swaggerSpec, AGENT_TAGS);

app.get("/api-docs.json", (_req, res) => {
  res.json(servedSpec);
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(servedSpec));

// Feature routers. A router mounts at the version and domain prefix only; each
// route declares the rest of its own path.
//
// The callback router is mounted before the creator routes because the URL X is
// registered against, /connections/callback, would otherwise be matched by
// /connections/:token and answered with a 401 the creator's browser lands on.
//
// The agent, its X connection and its previews are mounted only while AGENTS_ENABLED
// is on. Off, their paths fall through to the 404 every unknown path gets.
app.use("/api/v1/auth", sessionRoutes);
app.use("/api/v1/core", healthRoutes);
if (env.AGENTS_ENABLED) {
  app.use("/api/v1/core", agentRoutes);
  app.use("/api/v1/core", agentAdminRoutes);
  app.use("/api/v1/core", connectionCallbackRoutes);
  app.use("/api/v1/core", connectionRoutes);
  app.use("/api/v1/core", previewRoutes);
}
app.use("/api/v1/core", logoRoutes);
app.use("/api/v1/market", tradeRoutes);
app.use("/api/v1/market", chartRoutes);
app.use("/api/v1/market", holderRoutes);
app.use("/api/v1/market", tokenRoutes);
app.use("/api/v1/market", quoteAssetRoutes);
app.use("/api/v1/market", analyticsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
