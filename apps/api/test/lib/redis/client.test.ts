import { describe, expect, it, vi } from "vitest";

// test/setup.ts mocks this module for every feature test. Here the real one runs over
// a fake ioredis, so the options each connection is opened with can be read. The fake
// records into plain arrays, because clearMocks wipes a mock's calls before each test
// and these connections are opened once, at import.
vi.unmock("@/lib/redis/client");

const { opened, listened } = vi.hoisted(() => ({
  opened: [] as Record<string, unknown>[],
  listened: [] as string[],
}));

vi.mock("ioredis", () => ({
  default: class {
    constructor(_url: string, options: Record<string, unknown>) {
      opened.push(options);
    }
    on(event: string) {
      listened.push(event);
    }
  },
}));

import "@/lib/redis/client";

describe("the Redis connections", () => {
  it("lets the shared connection wait out an outage, which BullMQ needs", () => {
    expect(opened[0]).toEqual({ maxRetriesPerRequest: null });
  });

  it("refuses a cache command at once while disconnected, so an outage queues nothing", () => {
    expect(opened[1]).toMatchObject({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
    });
  });

  it("fails a cache command that takes longer than a healthy read, so a page never waits on it", () => {
    expect(opened[1]).toMatchObject({ commandTimeout: 250 });
  });

  it("listens for the cache connection's errors, so a lost Redis is logged and not unhandled", () => {
    expect(listened).toContain("error");
  });
});
