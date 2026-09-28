import { env } from "@/config/env"; // loads .env as a side effect

import prisma from "@/config/database";
import { logger } from "@/lib/logger";
import { startJobs, stopJobs } from "@/lib/jobs/jobs";
import { endIndexer } from "@/lib/indexer/client";
import { cacheRedis, redis } from "@/lib/redis/client";
import app from "./app";

// How long a shutdown may take before the process gives up on a clean exit. Below the
// ten seconds an orchestrator usually waits between SIGTERM and SIGKILL.
const SHUTDOWN_GRACE_MS = 8_000;

// Longer than the idle timeout of the proxy in front, so the proxy always closes an
// idle connection first and never sends a request down one this process just closed.
const KEEP_ALIVE_TIMEOUT_MS = 65_000;

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on http://localhost:${env.PORT}`);
  logger.info(`API docs at http://localhost:${env.PORT}/api-docs`);

  // Loud on purpose. A service that publishes nothing looks identical to a broken
  // scheduler from the outside, and this is the only line that tells them apart.
  if (env.X_DRY_RUN) logger.warn("X_DRY_RUN is on, no agent will publish");

  startJobs().catch((error: unknown) => fail("the scheduler did not start", error));
});

server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
server.headersTimeout = KEEP_ALIVE_TIMEOUT_MS + 1_000;

server.on("error", (error) => fail("the server could not listen", error));

let shuttingDown = false;

// Stops taking requests, lets the post in flight finish, then lets go of every
// connection the process holds. A second signal while this runs is ignored, and a
// shutdown that hangs is ended by the timer rather than by the orchestrator's kill.
const shutdown = async (reason: string, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`${reason}, shutting down`);
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();

  try {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await stopJobs();
    await prisma.$disconnect();
    await endIndexer();
    await redis.quit();
    await cacheRedis.quit();
  } catch (error) {
    logger.error("Error during shutdown", {
      error: error instanceof Error ? error.message : String(error),
    });
    exitCode = 1;
  }

  process.exit(exitCode);
};

// A failure nothing caught leaves the process in a state nobody reasoned about, so it
// is logged and the process restarts clean rather than limping on.
const fail = (reason: string, error: unknown) => {
  logger.error(reason, {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  void shutdown(reason, 1);
};

process.on("SIGTERM", () => void shutdown("SIGTERM received"));
process.on("SIGINT", () => void shutdown("SIGINT received"));
process.on("unhandledRejection", (error) => fail("unhandled rejection", error));
process.on("uncaughtException", (error) => fail("uncaught exception", error));
