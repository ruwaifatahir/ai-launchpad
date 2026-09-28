import { PostOutcome, Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/client", async (original) => ({
  ...(await original<typeof import("@/lib/ai/client")>()),
  generatePost: vi.fn(),
}));
vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));
vi.mock("@/lib/x/posting", async (original) => ({
  ...(await original<typeof import("@/lib/x/posting")>()),
  createPost: vi.fn(),
}));
vi.mock("@/features/core/agents/agents.repo", () => ({ findAgentByToken: vi.fn() }));
vi.mock("@/features/core/connections/data-model/connections.repo", () => ({
  deleteConnectionByToken: vi.fn(),
}));
vi.mock("@/features/core/connections/domain/renewal", () => ({
  readLiveCredential: vi.fn(),
}));
vi.mock("@/features/core/posts/domain/eligibility", () => ({
  readSilenceReason: vi.fn(),
}));
// Spread rather than replaced: RECENT_POSTS lives beside the writer, because how
// far back it remembers is the writer's rule and the preview feature reads the same
// one. A factory that dropped it would hand the repo an undefined limit.
vi.mock("@/features/core/posts/domain/writing", async (original) => ({
  ...(await original<typeof import("@/features/core/posts/domain/writing")>()),
  writePost: vi.fn(),
}));
vi.mock("@/features/core/posts/posts.repo", () => ({
  createDryPost: vi.fn(),
  createUnresolvedPost: vi.fn(),
  findRecentPostsByToken: vi.fn(),
  updatePostFailed: vi.fn(),
  updatePostPublished: vi.fn(),
}));

import {
  ModelRefusedError,
  ModelUnreachableError,
  ModelUnusableError,
} from "@/lib/ai/client";
import { readTokenGraduation } from "@/features/core/graduations/reading";
import { logger } from "@/lib/logger";
import {
  XCredentialDeadError,
  XPostRefusedError,
  XRateLimitedError,
  createPost,
} from "@/lib/x/posting";
import { XUnreachableError } from "@/lib/x/transport";
import { findAgentByToken } from "@/features/core/agents/agents.repo";
import { deleteConnectionByToken } from "@/features/core/connections/data-model/connections.repo";
import { readLiveCredential } from "@/features/core/connections/domain/renewal";
import { readSilenceReason } from "@/features/core/posts/domain/eligibility";
import { publishPost } from "@/features/core/posts/domain/publishing";
import { writePost } from "@/features/core/posts/domain/writing";
import {
  createDryPost,
  createUnresolvedPost,
  findRecentPostsByToken,
  updatePostFailed,
  updatePostPublished,
} from "@/features/core/posts/posts.repo";
import { TEST_ENV } from "@test/helpers/env.mock";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;

const credential = "the-access-credential-x-issued";

const xPostId = "1799999999999999999";

const text = "the post the agent wrote";

const agent = {
  token,
  name: "Vector",
  personality: "Terse and certain",
  lore: "Born in a warehouse",
  style: "Short sentences",
  topics: ["the curve"],
  pace: 4,
  nextPostAt: null,
  pausedAt: null,
  stoppedAt: null,
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
};

const row = {
  id: "2b9d2b0a-2f9a-4a33-9f2f-6a1b0c5d4e3f",
  token,
  text,
  outcome: PostOutcome.unresolved,
  reason: null,
  xPostId: null,
  xCost: new Prisma.Decimal(0),
  writerCost: new Prisma.Decimal(0),
  inputTokens: 0,
  outputTokens: 0,
  createdAt: new Date("2026-05-01T09:00:00.000Z"),
  updatedAt: new Date("2026-05-01T09:00:00.000Z"),
};

const refusedBy = async (cause: Error) => {
  vi.mocked(createPost).mockRejectedValue(cause);

  await publishPost(token);
};

const published = () => vi.mocked(updatePostPublished).mock.calls[0][1];

const failed = () => vi.mocked(updatePostFailed).mock.calls[0];

const ranBefore = (
  first: { mock: { invocationCallOrder: number[] } },
  second: typeof first,
) => first.mock.invocationCallOrder[0] < second.mock.invocationCallOrder[0];

describe("publishPost", () => {
  beforeEach(() => {
    vi.mocked(readSilenceReason).mockResolvedValue(null);
    vi.mocked(readLiveCredential).mockResolvedValue(credential);
    vi.mocked(findAgentByToken).mockResolvedValue(agent);
    vi.mocked(findRecentPostsByToken).mockResolvedValue([
      { text: "the last thing it said" },
    ]);
    vi.mocked(writePost).mockResolvedValue({ text, inputTokens: 412, outputTokens: 63 });
    vi.mocked(createUnresolvedPost).mockResolvedValue(row);
    vi.mocked(createPost).mockResolvedValue(xPostId);
  });

  it("writes no row at all for an agent that may not publish, because recording a slot a paused agent never used would make the count of published rows a dishonest cost figure", async () => {
    vi.mocked(readSilenceReason).mockResolvedValue("paused");

    await publishPost(token);

    expect(createUnresolvedPost).not.toHaveBeenCalled();
    expect(writePost).not.toHaveBeenCalled();
    expect(createPost).not.toHaveBeenCalled();
  });

  it("logs the reason an agent stayed silent, because this feature ships no screen and the log is the only place an admin can see it", async () => {
    vi.mocked(readSilenceReason).mockResolvedValue("connection");

    await publishPost(token);

    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      token,
      reason: "connection",
    });
  });

  it("asks the node nothing, because a connection can only exist for a graduated token and a locked agent would otherwise cost an RPC call every minute forever", async () => {
    await publishPost(token);

    expect(readTokenGraduation).not.toHaveBeenCalled();
  });

  it("reads the live credential before it writes anything, so a post is never lost to an expiry that was visible in advance", async () => {
    await publishPost(token);

    expect(ranBefore(vi.mocked(readLiveCredential), vi.mocked(writePost))).toBe(true);
  });

  it("spends nothing on an agent with no live credential, because renewal has already decided the connection cannot be used", async () => {
    vi.mocked(readLiveCredential).mockResolvedValue(null);

    await publishPost(token);

    expect(writePost).not.toHaveBeenCalled();
    expect(createUnresolvedPost).not.toHaveBeenCalled();
    expect(createPost).not.toHaveBeenCalled();
  });

  it("does not read the credential again after X rejects one, because renewal owns that decision and made it before the post rather than after this failure", async () => {
    await refusedBy(new XCredentialDeadError("401"));

    expect(readLiveCredential).toHaveBeenCalledTimes(1);
  });

  it("hands the writer the persona and the topics the creator wrote, so the character that speaks is the one they set up", async () => {
    await publishPost(token);

    expect(writePost).toHaveBeenCalledWith(
      expect.objectContaining({
        name: agent.name,
        personality: agent.personality,
        lore: agent.lore,
        style: agent.style,
        topics: agent.topics,
      }),
    );
  });

  it("hands the writer the last ten posts it published or rehearsed, so an agent avoids repeating itself without a second store of what it said", async () => {
    await publishPost(token);

    expect(findRecentPostsByToken).toHaveBeenCalledWith(token, 10);
    expect(writePost).toHaveBeenCalledWith(
      expect.objectContaining({ recentPosts: ["the last thing it said"] }),
    );
  });

  it("publishes nothing when a persona part went missing after the check, because the read closest to the post is the one that decides", async () => {
    vi.mocked(findAgentByToken).mockResolvedValue({ ...agent, style: null });

    await publishPost(token);

    expect(writePost).not.toHaveBeenCalled();
    expect(createUnresolvedPost).not.toHaveBeenCalled();
  });

  it("writes no row when the writer produced nothing publishable, because a draft that never passed the checks is not an attempt at X", async () => {
    vi.mocked(writePost).mockResolvedValue(null);

    await publishPost(token);

    expect(createUnresolvedPost).not.toHaveBeenCalled();
    expect(createPost).not.toHaveBeenCalled();
  });

  it("skips the slot when the model could not be reached, because an outage is worth waiting out rather than recording as an attempt", async () => {
    vi.mocked(writePost).mockRejectedValue(new ModelUnreachableError("fetch failed"));

    await publishPost(token);

    expect(createUnresolvedPost).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      token,
      cause: expect.any(ModelUnreachableError),
    });
  });

  it("logs at error when the model refuses to write a persona, because it will refuse the same character every slot until somebody reads it", async () => {
    vi.mocked(writePost).mockRejectedValue(new ModelRefusedError("content-filter"));

    await publishPost(token);

    expect(createUnresolvedPost).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), {
      token,
      cause: expect.any(ModelRefusedError),
    });
  });

  it("logs at error when the model answers with nothing usable, because a broken response is ours to fix rather than a wait", async () => {
    vi.mocked(writePost).mockRejectedValue(new ModelUnusableError(undefined));

    await publishPost(token);

    expect(createUnresolvedPost).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), {
      token,
      cause: expect.any(ModelUnusableError),
    });
  });

  it("lets a writing failure with no name through, so a fault AI Launchpad has never seen is never filed away as an ordinary skip", async () => {
    vi.mocked(writePost).mockRejectedValue(new Error("something nobody named"));

    await expect(publishPost(token)).rejects.toThrow();
    expect(createUnresolvedPost).not.toHaveBeenCalled();
  });

  it("writes the row before it calls X, because X publishes no idempotency key and a crash between the two has to lose the slot rather than publish twice", async () => {
    await publishPost(token);

    expect(ranBefore(vi.mocked(createUnresolvedPost), vi.mocked(createPost))).toBe(true);
  });

  it("sends X the text the writer produced and the credential renewal handed over, because nothing rewrites a post between the two", async () => {
    await publishPost(token);

    expect(createPost).toHaveBeenCalledWith({ accessCredential: credential, text });
  });

  it("leaves the row unresolved when the failure has no name, so an attempt whose outcome AI Launchpad never learned is never picked up again", async () => {
    vi.mocked(createPost).mockRejectedValue(new Error("400 at the post endpoint"));

    await expect(publishPost(token)).rejects.toThrow();
    expect(updatePostPublished).not.toHaveBeenCalled();
    expect(updatePostFailed).not.toHaveBeenCalled();
  });

  it("records the identifier X assigned, so a published post can be found again", async () => {
    await publishPost(token);

    expect(vi.mocked(updatePostPublished).mock.calls[0][0]).toBe(row.id);
    expect(published().xPostId).toBe(xPostId);
  });

  it("records what X charged and what the model charged as they stood at the time, because a constant read back later would rewrite the cost of every post made before a price change", async () => {
    await publishPost(token);

    expect(published().xCost).toBe(0.015);
    expect(published().writerCost).toBe(0.000229);
  });

  it("records the token counts beside the money, because a derived figure with nothing behind it cannot be checked when a bill looks wrong", async () => {
    await publishPost(token);

    expect(published().inputTokens).toBe(412);
    expect(published().outputTokens).toBe(63);
  });

  it("logs the token and the post identifier on every publish, because X requires an app to monitor its own users and this log is the only surface that does", async () => {
    await publishPost(token);

    expect(logger.info).toHaveBeenCalledWith(expect.any(String), { token, xPostId });
  });

  it("leaves the connection alone when X rejects the credential, because renewal owns ending one and already decided this grant is alive", async () => {
    await refusedBy(new XCredentialDeadError("401"));

    expect(deleteConnectionByToken).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      token,
      cause: expect.any(XCredentialDeadError),
    });
  });

  it("records the attempt failed when X rejects the credential, because the row is the only record that the slot was spent", async () => {
    await refusedBy(new XCredentialDeadError("401"));

    expect(failed()[0]).toBe(row.id);
    expect(failed()[1]).toBe("X no longer accepts this creator's access credential.");
  });

  it("never asks X again after it refuses a post on policy, because a rule violation repeated is what gets a whole app suspended", async () => {
    await refusedBy(new XPostRefusedError("403"));

    expect(createPost).toHaveBeenCalledTimes(1);
    expect(updatePostFailed).toHaveBeenCalledTimes(1);
  });

  it("logs a policy refusal at error rather than at warn, because it is the one X failure that needs a person to read it", async () => {
    await refusedBy(new XPostRefusedError("403"));

    expect(logger.error).toHaveBeenCalledWith(expect.any(String), {
      token,
      cause: expect.any(XPostRefusedError),
    });
  });

  it("skips the slot when X is taking no more posts, so pressure is never added to a limit already reached", async () => {
    await refusedBy(new XRateLimitedError("429"));

    expect(failed()[0]).toBe(row.id);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      token,
      cause: expect.any(XRateLimitedError),
    });
  });

  it("skips the slot when X could not be reached, so an outage costs one slot and nothing beyond it", async () => {
    await refusedBy(new XUnreachableError("504"));

    expect(failed()[0]).toBe(row.id);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      token,
      cause: expect.any(XUnreachableError),
    });
  });

  it("records nothing as published when X did not publish it, because a published row is what the cost of the product is counted from", async () => {
    await refusedBy(new XRateLimitedError("429"));

    expect(updatePostPublished).not.toHaveBeenCalled();
  });

  it("writes no dry row while the flag is off, so the default of a box nobody configured is to publish for real", async () => {
    await publishPost(token);

    expect(createDryPost).not.toHaveBeenCalled();
    expect(createPost).toHaveBeenCalledTimes(1);
  });

  describe("with X_DRY_RUN on", () => {
    beforeEach(() => {
      TEST_ENV.X_DRY_RUN = true;
    });

    afterEach(() => {
      TEST_ENV.X_DRY_RUN = false;
    });

    it("calls X not at all, which is the one thing the flag exists to stop", async () => {
      await publishPost(token);

      expect(createPost).not.toHaveBeenCalled();
    });

    it("records the attempt under its own outcome rather than in the log alone, because the writer reads the database for what it already said and would otherwise write the same post every slot", async () => {
      await publishPost(token);

      expect(createDryPost).toHaveBeenCalledWith(
        token,
        expect.objectContaining({ text }),
      );
      expect(createUnresolvedPost).not.toHaveBeenCalled();
      expect(updatePostPublished).not.toHaveBeenCalled();
    });

    it("records what the model charged and no figure at all for X, because the writer really ran and X really was never called", async () => {
      await publishPost(token);

      const written = vi.mocked(createDryPost).mock.calls[0][1];

      expect(written.writerCost).toBe(0.000229);
      expect(written.inputTokens).toBe(412);
      expect(written.outputTokens).toBe(63);
      expect(written).not.toHaveProperty("xCost");
    });

    it("logs the draft, because a dry run that does not show what the agent would have said proves only that the scheduler fired", async () => {
      await publishPost(token);

      expect(logger.info).toHaveBeenCalledWith(expect.any(String), { token, text });
    });

    it("writes nothing for an agent that may not publish, so the flag is never a way to record a slot a paused agent never used", async () => {
      vi.mocked(readSilenceReason).mockResolvedValue("paused");

      await publishPost(token);

      expect(createDryPost).not.toHaveBeenCalled();
      expect(writePost).not.toHaveBeenCalled();
    });

    it("still reads the live credential and stops without one, so a rehearsal keeps telling you when a creator's connection has died", async () => {
      vi.mocked(readLiveCredential).mockResolvedValue(null);

      await publishPost(token);

      expect(readLiveCredential).toHaveBeenCalledWith(token);
      expect(createDryPost).not.toHaveBeenCalled();
      expect(writePost).not.toHaveBeenCalled();
    });
  });
});
