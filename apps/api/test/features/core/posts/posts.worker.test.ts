import { describe, expect, it, vi } from "vitest";

const { addBulk, claimDueSlots, publishPost } = vi.hoisted(() => ({
  addBulk: vi.fn(),
  claimDueSlots: vi.fn(),
  publishPost: vi.fn(),
}));

vi.mock("@/lib/jobs/queue", () => ({ POST_JOB: "post", postsQueue: { addBulk } }));

vi.mock("@/features/core/posts/domain/scheduling", () => ({ claimDueSlots }));

vi.mock("@/features/core/posts/domain/publishing", () => ({ publishPost }));

import { runPostJob, runPostsTick } from "@/features/core/posts/posts.worker";

const token = "0xbcd4042de499d14e55001ccbb24a551f3b954096";
const other = "0x1111111111111111111111111111111111111111";

const job = (data: unknown) => ({ data }) as never;

const enqueued = () => addBulk.mock.calls[0][0] as { name: string; data: unknown }[];

describe("runPostsTick", () => {
  it("enqueues one job for each agent the tick claimed, so an agent claimed once is published once", async () => {
    claimDueSlots.mockResolvedValue([token, other]);

    await runPostsTick();

    expect(enqueued()).toEqual([
      { name: "post", data: { token } },
      { name: "post", data: { token: other } },
    ]);
  });

  it("enqueues nothing when no agent is due, so an idle minute costs a sweep and no work", async () => {
    claimDueSlots.mockResolvedValue([]);

    await runPostsTick();

    expect(enqueued()).toEqual([]);
  });

  it("claims before it enqueues, because the claim is what stops the same agent being enqueued twice", async () => {
    const order: string[] = [];

    claimDueSlots.mockImplementation(() => {
      order.push("claimed");

      return Promise.resolve([token]);
    });
    addBulk.mockImplementation(() => {
      order.push("enqueued");

      return Promise.resolve([]);
    });

    await runPostsTick();

    expect(order).toEqual(["claimed", "enqueued"]);
  });
});

describe("runPostJob", () => {
  it("publishes for the token the job names, so a job is one post for one agent", async () => {
    await runPostJob(job({ token }));

    expect(publishPost).toHaveBeenCalledWith(token);
  });

  it("parses the job data at the boundary, so a malformed job fails before a post is written rather than halfway through one", async () => {
    await expect(runPostJob(job({ token: "nope" }))).rejects.toThrow();

    expect(publishPost).not.toHaveBeenCalled();
  });

  it("lowercases the token it publishes for, so the job reaches the same key the agents table is keyed by", async () => {
    await runPostJob(job({ token: "0xBcd4042DE499D14e55001CcbB24a551F3b954096" }));

    expect(publishPost).toHaveBeenCalledWith(token);
  });
});
