import { Router } from "express";
import { getHealth } from "@/features/core/health/entry-point/health.controller";

const router = Router();

/**
 * @openapi
 * /api/v1/core/health:
 *   get:
 *     tags: [Health]
 *     operationId: getHealth
 *     summary: Report whether the dependencies this API needs are answering
 *     description: >
 *       Probes Postgres and Redis and answers 200 only when both reply. Either one
 *       silent is a 503 naming which, so a deployment that came up without its
 *       database is distinguishable from one that is merely slow. GET / is not this
 *       check: it is a static reply that says nothing about either dependency.
 *
 *       Each probe is abandoned after two seconds. The Redis client is built with
 *       maxRetriesPerRequest null, which BullMQ requires and which makes a command
 *       queue forever rather than fail, so without that cap an outage would hang
 *       this route instead of being reported by it.
 *
 *       This is the one route with no rate limiter. The limiter stores its counters
 *       in Redis, so limiting this route would make a Redis outage silence the
 *       endpoint whose job is to report one. Both probes are a single round trip and
 *       neither reads a row.
 *     responses:
 *       200:
 *         description: Both dependencies answered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: >
 *           The database, Redis, or both failed to answer inside two seconds. The
 *           message names which.
 */
router.get("/health", getHealth);

export default router;
