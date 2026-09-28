import { Queue } from "bullmq";
import { redis } from "@/lib/redis/client";

// Two queues rather than one. The tick sweeps for due agents every minute, and a
// post costs a model call plus an X call, so posting inside the tick would let one
// slow model call delay every agent behind it.
//
// Retries are off on both, because a post is attempted at most once. The posting job
// is the reason: X publishes no idempotency key for creating a post, and a job
// retried after an unclear failure can publish the same text twice.
// The tick carries the same rule because it has nothing to gain from a retry: the
// next sweep is a minute away. The worker half is maxStalledCount in jobs.ts.
//
// Neither queue is a record of anything. The Post row carries the outcome and the
// log carries the reason, so a finished job is dropped rather than left to fill
// Redis forever at a job a minute.
const NEVER_RETRIED = { attempts: 1, removeOnComplete: true, removeOnFail: true };

export const POSTS_TICK_QUEUE = "posts-tick";
export const POSTS_QUEUE = "posts";
export const POST_JOB = "post";

export const postsTickQueue = new Queue(POSTS_TICK_QUEUE, {
  connection: redis,
  defaultJobOptions: NEVER_RETRIED,
});

export const postsQueue = new Queue(POSTS_QUEUE, {
  connection: redis,
  defaultJobOptions: NEVER_RETRIED,
});

// Stores each closed day's dollar rate, just after midnight UTC and once on boot. A
// feed it cannot read is tried again on the next run, so it is never retried.
export const DAILY_RATES_QUEUE = "daily-rates";
export const DAILY_RATES_JOB = "fill";

export const dailyRatesQueue = new Queue(DAILY_RATES_QUEUE, {
  connection: redis,
  defaultJobOptions: NEVER_RETRIED,
});
