import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { add, built, close, on, queueClose, removeJobScheduler, upsertJobScheduler } =
  vi.hoisted(() => ({
    add: vi.fn(),
    removeJobScheduler: vi.fn(),
    built: [] as { queue: string; options: Record<string, never> }[],
    close: vi.fn(),
    queueClose: vi.fn(),
    on: vi.fn(),
    upsertJobScheduler: vi.fn(),
  }));

vi.mock("bullmq", () => ({
  Queue: class {
    constructor(readonly name: string) {}
    add = add;
    upsertJobScheduler = upsertJobScheduler;
    removeJobScheduler = removeJobScheduler;
    close = queueClose;
  },
  Worker: class {
    on = on;
    close = close;

    constructor(queue: string, _processor: unknown, options: Record<string, never>) {
      built.push({ queue, options });
    }
  },
}));

import { logger } from "@/lib/logger";
import { TEST_ENV } from "@test/helpers/env.mock";
import {
  DAILY_RATES_JOB,
  DAILY_RATES_QUEUE,
  POSTS_QUEUE,
  POSTS_TICK_QUEUE,
} from "@/lib/jobs/queue";
import { startJobs, stopJobs } from "@/lib/jobs/jobs";

const failed = () =>
  on.mock.calls.find(([event]) => event === "failed")?.[1] as (
    job: unknown,
    cause: Error,
  ) => void;

beforeEach(async () => {
  built.length = 0;

  await startJobs();
});

afterEach(async () => {
  await stopJobs();
});

describe("startJobs", () => {
  it("registers a worker for each queue on boot, so nothing has to be started by hand", () => {
    expect(built.map((worker) => worker.queue)).toEqual([
      POSTS_TICK_QUEUE,
      POSTS_QUEUE,
      DAILY_RATES_QUEUE,
    ]);
  });

  it("sweeps every minute, which is what publishes a creator's first post within a minute of them finishing setup", () => {
    expect(upsertJobScheduler).toHaveBeenCalledWith("every-minute", {
      pattern: "* * * * *",
    });
  });

  it("stores the daily rates just after midnight UTC, once the day they close has ended", () => {
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "just-after-midnight",
      { pattern: "1 0 * * *", tz: "UTC" },
      { name: DAILY_RATES_JOB },
    );
  });

  it("stores the daily rates once on boot too, so a deploy fills any day a failed night missed", () => {
    expect(add).toHaveBeenCalledWith(DAILY_RATES_JOB, {});
  });

  it("never recovers a stalled job, because a worker that died may already have published and a post is attempted at most once", () => {
    for (const worker of built)
      expect(worker.options).toMatchObject({ maxStalledCount: 0 });
  });

  it("logs a job that failed, because a worker that throws is otherwise silent", () => {
    failed()({ id: "aJob" }, new Error("it broke"));

    expect(logger.error).toHaveBeenCalledWith("job failed", {
      queue: POSTS_TICK_QUEUE,
      job: "aJob",
      cause: "it broke",
    });
  });
});

describe("startJobs, with agents off", () => {
  beforeEach(async () => {
    await stopJobs();
    built.length = 0;
    upsertJobScheduler.mockClear();
    TEST_ENV.AGENTS_ENABLED = false;

    await startJobs();
  });

  afterEach(() => {
    TEST_ENV.AGENTS_ENABLED = true;
  });

  it("starts no posting worker, so nothing publishes while the feature is off", () => {
    expect(built.map((worker) => worker.queue)).toEqual([DAILY_RATES_QUEUE]);
  });

  it("removes the sweep a previous boot registered, rather than leaving it to fill Redis with ticks no worker takes", () => {
    expect(removeJobScheduler).toHaveBeenCalledWith("every-minute");
    expect(upsertJobScheduler).not.toHaveBeenCalledWith(
      "every-minute",
      expect.anything(),
    );
  });

  it("still stores the daily rates, which the market figures read", () => {
    expect(add).toHaveBeenCalledWith(DAILY_RATES_JOB, {});
  });
});

describe("stopJobs", () => {
  it("closes every worker, so a SIGTERM finishes the post in flight rather than leaving a row nobody resolves", async () => {
    await stopJobs();

    expect(close).toHaveBeenCalledTimes(built.length);
  });

  it("closes each worker once, so a second shutdown signal does not close a worker that is already gone", async () => {
    await stopJobs();
    await stopJobs();

    expect(close).toHaveBeenCalledTimes(built.length);
  });
});

describe("stopJobs, the queues", () => {
  it("closes every queue after the workers, so their Redis connections do not hold the process open on shutdown", async () => {
    await stopJobs();

    expect(queueClose).toHaveBeenCalledTimes(3);
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(
      queueClose.mock.invocationCallOrder[0],
    );
  });
});
