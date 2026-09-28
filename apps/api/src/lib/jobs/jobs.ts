import { Worker, type Processor } from "bullmq";
import { env } from "@/config/env";
import {
  DAILY_RATES_JOB,
  DAILY_RATES_QUEUE,
  POSTS_QUEUE,
  POSTS_TICK_QUEUE,
  dailyRatesQueue,
  postsQueue,
  postsTickQueue,
} from "@/lib/jobs/queue";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis/client";
import { runPostJob, runPostsTick } from "@/features/core/posts/posts.worker";
import { runDailyRates } from "@/features/market/daily-rates/daily-rates.worker";

// The scheduler, called from src/index.ts on boot and on shutdown. This file is to
// background work what app.ts is to HTTP: it registers what runs and holds nothing
// else.
//
// maxStalledCount: 0 is the worker half of attempting a post at most once, and the
// retries in queue.ts are the job half. BullMQ hands a job whose worker died back to
// another worker once by default, and that worker may already have published, so a
// stalled job is failed rather than recovered.
//
// Every worker is closed on shutdown, so a SIGTERM finishes the post in flight
// rather than leaving a row nobody will ever resolve.
//
// The failed listener is this queue's error handler, and it is central for the
// same reason the Express one is: a worker that throws is otherwise silent, and
// job data that fails its parse has to fail loudly rather than halfway through.

const workers: Worker[] = [];

const register = (queue: string, processor: Processor) => {
  const worker = new Worker(queue, processor, {
    connection: redis,
    maxStalledCount: 0,
  });

  worker.on("failed", (job, cause) =>
    logger.error("job failed", { queue, job: job?.id, cause: cause.message }),
  );

  workers.push(worker);
};

// The posting workers and their sweep run only while AGENTS_ENABLED is on. Off, the
// sweep is removed rather than left alone: a job scheduler lives in Redis, so one a
// previous boot registered would keep adding a tick a minute that no worker takes.
export const startJobs = async (): Promise<void> => {
  if (env.AGENTS_ENABLED) {
    register(POSTS_TICK_QUEUE, runPostsTick);
    register(POSTS_QUEUE, runPostJob);
  }
  register(DAILY_RATES_QUEUE, runDailyRates);

  if (env.AGENTS_ENABLED)
    await postsTickQueue.upsertJobScheduler("every-minute", { pattern: "* * * * *" });
  else await postsTickQueue.removeJobScheduler("every-minute");

  // A minute past midnight UTC, when the day the rates close has just ended. Once on
  // boot as well, so a deploy fills whatever a failed night left. A stalled run is
  // failed like any job here, and loses nothing: the next run finds the same days.
  await dailyRatesQueue.upsertJobScheduler(
    "just-after-midnight",
    { pattern: "1 0 * * *", tz: "UTC" },
    { name: DAILY_RATES_JOB },
  );
  await dailyRatesQueue.add(DAILY_RATES_JOB, {});
};

// Workers first, so the post in flight finishes, then the queues the tick writes to.
export const stopJobs = async (): Promise<void> => {
  await Promise.all(workers.splice(0).map((worker) => worker.close()));
  await Promise.all([
    postsTickQueue.close(),
    postsQueue.close(),
    dailyRatesQueue.close(),
  ]);
};
