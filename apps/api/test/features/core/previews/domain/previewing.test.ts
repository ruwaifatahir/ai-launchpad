import type { Agent } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));
vi.mock("@/features/core/agents/agents.repo", () => ({ findAgentByToken: vi.fn() }));
// Spread rather than replaced, because RECENT_POSTS lives beside the writer and a
// factory that dropped it would hand the history read an undefined limit.
vi.mock("@/features/core/posts/domain/writing", async (original) => ({
  ...(await original<typeof import("@/features/core/posts/domain/writing")>()),
  writePost: vi.fn(),
}));
vi.mock("@/features/core/posts/posts.repo", () => ({
  findRecentPostsByToken: vi.fn(),
}));
vi.mock("@/features/core/previews/previews.repo", () => ({
  addPreviewSpend: vi.fn(),
  incrementPreviewCount: vi.fn(),
  findPreviewCountByTokenAndDay: vi.fn(),
  decrementPreviewCount: vi.fn(),
}));

import { ApiError } from "@/shared";
import {
  ModelRefusedError,
  ModelUnreachableError,
  ModelUnusableError,
} from "@/lib/ai/client";
import { readTokenGraduation } from "@/features/core/graduations/reading";
import { findAgentByToken } from "@/features/core/agents/agents.repo";
import { writePost } from "@/features/core/posts/domain/writing";
import { findRecentPostsByToken } from "@/features/core/posts/posts.repo";
import {
  readPreviewAllowance,
  takePreview,
} from "@/features/core/previews/domain/previewing";
import {
  addPreviewSpend,
  incrementPreviewCount,
  findPreviewCountByTokenAndDay,
  decrementPreviewCount,
} from "@/features/core/previews/previews.repo";
import { prismaMock } from "@test/helpers/prisma.mock";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;
const params = { token };
const graduatedAt = new Date("2026-03-01T12:00:00.000Z");
const day = new Date("2026-09-19T00:00:00.000Z");
const midnight = new Date("2026-09-20T00:00:00.000Z");

const written: Agent = {
  token,
  name: "Vector",
  personality: "Terse and certain",
  lore: "Born in a warehouse",
  style: "Short sentences",
  topics: ["the curve", "the stock"],
  pace: 4,
  nextPostAt: null,
  pausedAt: null,
  stoppedAt: null,
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
};

const draft = { text: "The curve holds.", inputTokens: 500, outputTokens: 100 };

describe("takePreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T14:37:00.000Z"));

    vi.mocked(findAgentByToken).mockResolvedValue(written);
    vi.mocked(readTokenGraduation).mockResolvedValue(graduatedAt);
    vi.mocked(incrementPreviewCount).mockResolvedValue(1);
    vi.mocked(findRecentPostsByToken).mockResolvedValue([{ text: "Said before." }]);
    vi.mocked(writePost).mockResolvedValue(draft);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns what the writer wrote, so the creator reads the post their persona produces", async () => {
    expect((await takePreview(params)).text).toBe("The curve holds.");
  });

  it("refuses a stopped agent before anything is claimed or written, because an AI Launchpad admin ended it", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({
      ...written,
      stoppedAt: new Date(),
    });

    await expect(takePreview(params)).rejects.toMatchObject({ statusCode: 409 });
    expect(incrementPreviewCount).not.toHaveBeenCalled();
    expect(writePost).not.toHaveBeenCalled();
  });

  it("refuses a token whose pool has not opened, so tuning waits for graduation rather than spending on an agent that may never publish", async () => {
    vi.mocked(readTokenGraduation).mockResolvedValue(null);

    await expect(takePreview(params)).rejects.toMatchObject({ statusCode: 409 });
    expect(incrementPreviewCount).not.toHaveBeenCalled();
  });

  it("refuses a persona missing any one of its four parts, because there is nothing to preview", async () => {
    for (const part of ["name", "personality", "lore", "style"] as const) {
      vi.mocked(findAgentByToken).mockResolvedValue({ ...written, [part]: null });

      await expect(takePreview(params)).rejects.toMatchObject({ statusCode: 409 });
    }

    expect(incrementPreviewCount).not.toHaveBeenCalled();
  });

  it("refuses a token the creator has never written to, which has no agent row at all", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue(null);

    await expect(takePreview(params)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("names the stop ahead of the lock, so an agent that is both reads as the decision somebody made rather than the step nobody took", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...written, stoppedAt: new Date() });
    vi.mocked(readTokenGraduation).mockResolvedValue(null);

    await expect(takePreview(params)).rejects.toThrow(/admin stopped this agent/);
  });

  it("names the lock ahead of the persona, so a creator on the curve is told to graduate rather than sent to finish writing", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...written, name: null });
    vi.mocked(readTokenGraduation).mockResolvedValue(null);

    await expect(takePreview(params)).rejects.toThrow(/has not graduated/);
  });

  it("previews a paused agent, because a pause stops publishing and a preview publishes nothing", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...written, pausedAt: new Date() });

    expect((await takePreview(params)).text).toBe("The curve holds.");
  });

  it("reads nothing about an X connection, so a creator tunes the persona before they ever connect an account", async () => {
    await takePreview(params);

    expect(prismaMock.connection.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.connection.findFirst).not.toHaveBeenCalled();
  });

  it("claims the allowance before the writer runs, so an exhausted creator never reaches the model at all", async () => {
    vi.mocked(incrementPreviewCount).mockResolvedValue(21);

    await expect(takePreview(params)).rejects.toMatchObject({ statusCode: 429 });
    expect(writePost).not.toHaveBeenCalled();
  });

  it("gives back a claim that went over the allowance, so the count cannot drift past twenty and lock the creator out of tomorrow", async () => {
    vi.mocked(incrementPreviewCount).mockResolvedValue(21);

    await expect(takePreview(params)).rejects.toThrow(ApiError);
    expect(decrementPreviewCount).toHaveBeenCalledWith(token, day);
  });

  it("allows the twentieth preview of the day and refuses the twenty first, so the allowance is twenty rather than nineteen", async () => {
    vi.mocked(incrementPreviewCount).mockResolvedValue(20);

    expect((await takePreview(params)).remaining).toBe(0);
  });

  it("meters the day under the UTC date rather than the instant, so the allowance resets with the day the pace already uses", async () => {
    await takePreview(params);

    expect(incrementPreviewCount).toHaveBeenCalledWith(token, day);
  });

  it("reports the reset at the next UTC midnight, so the panel can say when the allowance returns", async () => {
    expect((await takePreview(params)).resetsAt).toEqual(midnight);
  });

  it("publishes the allowance beside what is left, so the panel shows four of twenty without doing the arithmetic itself", async () => {
    vi.mocked(incrementPreviewCount).mockResolvedValue(16);

    const preview = await takePreview(params);

    expect(preview.allowance).toBe(20);
    expect(preview.remaining).toBe(4);
  });

  it("hands the writer the same history the scheduler hands it, the last ten published or dry posts and no preview among them", async () => {
    await takePreview(params);

    expect(findRecentPostsByToken).toHaveBeenCalledWith(token, 10);
    expect(vi.mocked(writePost).mock.calls[0][0].recentPosts).toEqual(["Said before."]);
  });

  it("hands the writer the saved persona and the saved topics, because a preview predicts what the agent does unattended", async () => {
    await takePreview(params);

    expect(vi.mocked(writePost).mock.calls[0][0]).toMatchObject({
      name: "Vector",
      personality: "Terse and certain",
      lore: "Born in a warehouse",
      style: "Short sentences",
      topics: ["the curve", "the stock"],
    });
  });

  it("records what the writer charged against the day, so the cost of previewing is a figure somebody can read back", async () => {
    await takePreview(params);

    expect(addPreviewSpend).toHaveBeenCalledWith(token, day, {
      writerCost: 0.000325,
      inputTokens: 500,
      outputTokens: 100,
    });
  });

  it("stores no text anywhere, so a preview leaves a cost and never a record of what it said", async () => {
    await takePreview(params);

    expect(JSON.stringify(vi.mocked(addPreviewSpend).mock.calls)).not.toContain(
      "The curve holds.",
    );
  });

  it("writes no post row, so a preview never joins the count the real cost of the product is read from", async () => {
    await takePreview(params);

    expect(prismaMock.post.create).not.toHaveBeenCalled();
    expect(prismaMock.post.update).not.toHaveBeenCalled();
  });

  it("answers a writer that refused this persona with a reason rather than an error, because that is the most useful thing tuning can learn", async () => {
    vi.mocked(writePost).mockRejectedValue(new ModelRefusedError("filtered"));

    expect(await takePreview(params)).toMatchObject({ text: null, reason: "refused" });
  });

  it("gives the preview back when the writer refused, because the creator got nothing for it", async () => {
    vi.mocked(writePost).mockRejectedValue(new ModelRefusedError("filtered"));

    const preview = await takePreview(params);

    expect(decrementPreviewCount).toHaveBeenCalledWith(token, day);
    expect(preview.remaining).toBe(20);
  });

  it("answers two drafts that broke the rules a post is held to with a reason rather than an error, and gives the preview back", async () => {
    vi.mocked(writePost).mockResolvedValue(null);

    const preview = await takePreview(params);

    expect(preview).toMatchObject({ text: null, reason: "unpublishable" });
    expect(decrementPreviewCount).toHaveBeenCalledWith(token, day);
    expect(preview.remaining).toBe(20);
  });

  it("records no spend for a preview that produced nothing, because the writer discards the counts of an attempt it rejected", async () => {
    vi.mocked(writePost).mockResolvedValue(null);

    await takePreview(params);

    expect(addPreviewSpend).not.toHaveBeenCalled();
  });

  it("refuses with a 503 when the writer could not be reached, because that is AI Launchpad's problem rather than a fact about the persona", async () => {
    vi.mocked(writePost).mockRejectedValue(new ModelUnreachableError("down"));

    await expect(takePreview(params)).rejects.toMatchObject({ statusCode: 503 });
  });

  it("refuses with a 503 when the writer answered with nothing usable, for the same reason", async () => {
    vi.mocked(writePost).mockRejectedValue(new ModelUnusableError("garbage"));

    await expect(takePreview(params)).rejects.toMatchObject({ statusCode: 503 });
  });

  it("gives the preview back when the writer could not be reached, so an outage costs the creator none of their day", async () => {
    vi.mocked(writePost).mockRejectedValue(new ModelUnreachableError("down"));

    await expect(takePreview(params)).rejects.toThrow(ApiError);
    expect(decrementPreviewCount).toHaveBeenCalledWith(token, day);
  });

  it("lets a failure the writer has no name for through untouched, rather than filing it as a refusal the creator can act on", async () => {
    const failure = new Error("something else entirely");

    vi.mocked(writePost).mockRejectedValue(failure);

    await expect(takePreview(params)).rejects.toBe(failure);
  });

  it("exposes the same keys whether the writer answered or not, so the panel reads one shape", async () => {
    const answered = Object.keys(await takePreview(params));

    vi.mocked(writePost).mockResolvedValue(null);

    expect(Object.keys(await takePreview(params))).toEqual(answered);
  });

  it("returns no cost and no token counts, because what the model charged is AI Launchpad's to know and not the creator's", async () => {
    const preview = await takePreview(params);

    expect(preview).not.toHaveProperty("writerCost");
    expect(preview).not.toHaveProperty("inputTokens");
    expect(preview).not.toHaveProperty("outputTokens");
  });
});

describe("readPreviewAllowance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T14:37:00.000Z"));

    vi.mocked(findPreviewCountByTokenAndDay).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the full allowance for an agent that has taken none today, rather than refusing a day with no row", async () => {
    expect(await readPreviewAllowance(params)).toMatchObject({
      allowance: 20,
      remaining: 20,
    });
  });

  it("subtracts what the day already holds, so the panel can show what is left before spending one to find out", async () => {
    vi.mocked(findPreviewCountByTokenAndDay).mockResolvedValue(16);

    expect((await readPreviewAllowance(params)).remaining).toBe(4);
  });

  it("reads the meter for today's UTC day, the same day the write claims against", async () => {
    await readPreviewAllowance(params);

    expect(findPreviewCountByTokenAndDay).toHaveBeenCalledWith(token, day);
  });

  it("reports the same reset the write reports, so the two never disagree about when the day turns", async () => {
    expect((await readPreviewAllowance(params)).resetsAt).toEqual(midnight);
  });

  it("spends nothing and creates nothing, so asking what is left never costs a preview", async () => {
    await readPreviewAllowance(params);

    expect(incrementPreviewCount).not.toHaveBeenCalled();
    expect(addPreviewSpend).not.toHaveBeenCalled();
    expect(writePost).not.toHaveBeenCalled();
  });

  it("applies none of the three refusals the write applies, so it never reads the agent or the indexer and never answers 409 for a stopped or locked one", async () => {
    await readPreviewAllowance(params);

    expect(findAgentByToken).not.toHaveBeenCalled();
    expect(readTokenGraduation).not.toHaveBeenCalled();
  });
});
