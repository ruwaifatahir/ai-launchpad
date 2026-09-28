import { describe, expect, it, vi } from "vitest";

// A class rather than a vi.fn, because the module under test builds its queues
// once at import and clearMocks would wipe a spy's record of those calls before
// the first test runs. built is a plain array, so it survives.
const { built } = vi.hoisted(() => ({
  built: [] as { name: string; options: Record<string, never> }[],
}));

vi.mock("bullmq", () => ({
  Queue: class {
    constructor(name: string, options: Record<string, never>) {
      built.push({ name, options });
    }
  },
}));

import { DAILY_RATES_QUEUE, POSTS_QUEUE, POSTS_TICK_QUEUE } from "@/lib/jobs/queue";

const optionsFor = (name: string) =>
  built.find((queue) => queue.name === name)?.options as unknown as {
    defaultJobOptions: { attempts: number; removeOnComplete: boolean };
  };

describe("the posting queue", () => {
  it("is separate from the tick, so one slow post never delays the sweep behind it", () => {
    expect(built.map((queue) => queue.name)).toContain(POSTS_TICK_QUEUE);
    expect(built.map((queue) => queue.name)).toContain(POSTS_QUEUE);
  });

  it("attempts a post once and never again, because X publishes no idempotency key and a retried post is a duplicate", () => {
    expect(optionsFor(POSTS_QUEUE).defaultJobOptions.attempts).toBe(1);
  });

  it("attempts a tick once and never again, because the next sweep is a minute away", () => {
    expect(optionsFor(POSTS_TICK_QUEUE).defaultJobOptions.attempts).toBe(1);
  });

  it("keeps no finished job, because the Post row is the record and a job a minute would fill Redis forever", () => {
    expect(optionsFor(POSTS_QUEUE).defaultJobOptions).toMatchObject({
      removeOnComplete: true,
      removeOnFail: true,
    });
    expect(optionsFor(POSTS_TICK_QUEUE).defaultJobOptions).toMatchObject({
      removeOnComplete: true,
      removeOnFail: true,
    });
  });
});

describe("the daily rates queue", () => {
  it("runs a fill once and never again, because the next run tries every missing day anyway", () => {
    expect(optionsFor(DAILY_RATES_QUEUE).defaultJobOptions).toMatchObject({
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    });
  });
});
