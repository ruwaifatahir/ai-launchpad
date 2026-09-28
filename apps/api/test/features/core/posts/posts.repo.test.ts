import { PostOutcome, Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  createDryPost,
  createUnresolvedPost,
  findRecentPostsByToken,
  updatePostFailed,
  updatePostPublished,
} from "@/features/core/posts/posts.repo";
import { prismaMock } from "@test/helpers/prisma.mock";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e";
const other = "0xbcd4042de499d14e55001ccbb24a551f3b954096";
const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const text = "the quiet part out loud";

const created = () => vi.mocked(prismaMock.post.create).mock.calls[0][0];
const updated = () => vi.mocked(prismaMock.post.update).mock.calls[0][0];
const found = () => vi.mocked(prismaMock.post.findMany).mock.calls[0][0];

describe("posts.repo, writing the attempt down", () => {
  it("createUnresolvedPost pins the outcome to unresolved, because a row that exists before X is called must never read as something that was published", () => {
    createUnresolvedPost(token, { text });

    expect(created().data.outcome).toBe(PostOutcome.unresolved);
  });

  it("createUnresolvedPost records the text, so the row written before the X call already holds what was about to be published", () => {
    createUnresolvedPost(token, { text });

    expect(created().data.text).toBe(text);
  });

  it("createUnresolvedPost writes against the token it was handed, never a fixed one, so one agent's attempt never lands under another token", () => {
    createUnresolvedPost(other, { text });

    expect(created().data.token).toBe(other);
  });
});

const published = {
  xPostId: "1976543210987654321",
  xCost: new Prisma.Decimal("0.01500000"),
  writerCost: new Prisma.Decimal("0.00043912"),
  inputTokens: 512,
  outputTokens: 64,
};

describe("posts.repo, resolving the attempt", () => {
  it("updatePostPublished moves the outcome to published, which is what separates an attempt X answered from one a crash left unresolved for good", () => {
    updatePostPublished(id, published);

    expect(updated().data.outcome).toBe(PostOutcome.published);
  });

  it("updatePostPublished records the identifier X assigned, because it and the log are the only handle an admin has on what an agent actually published", () => {
    updatePostPublished(id, published);

    expect(updated().data.xPostId).toBe("1976543210987654321");
  });

  it("updatePostPublished records both token counts, because a cost figure with nothing behind it cannot be checked when a bill looks wrong", () => {
    updatePostPublished(id, published);

    expect(updated().data.inputTokens).toBe(512);
    expect(updated().data.outputTokens).toBe(64);
  });

  it("updatePostPublished hands both charges on at eight decimal places, so a $0.0004 writing charge arrives whole rather than rounded away to zero", () => {
    updatePostPublished(id, published);

    expect(updated().data.xCost.toFixed(8)).toBe("0.01500000");
    expect(updated().data.writerCost.toFixed(8)).toBe("0.00043912");
  });

  it("updatePostFailed moves the outcome to failed and records why, because a row that failed with no reason says nothing anyone can act on", () => {
    updatePostFailed(id, "X refused the post on policy");

    expect(updated().data.outcome).toBe(PostOutcome.failed);
    expect(updated().data.reason).toBe("X refused the post on policy");
  });

  it("both resolutions scope the write to the row id, never to the token, because a token holds many attempts and only the one in flight resolves", () => {
    updatePostPublished(id, published);
    updatePostFailed(id, "X refused the post on policy");

    const [first, second] = vi.mocked(prismaMock.post.update).mock.calls;

    expect(first[0].where).toEqual({ id });
    expect(second[0].where).toEqual({ id });
  });

  it("createDryPost pins the outcome to dry, so a rehearsal is never counted among the rows the cost of the product is read from", () => {
    createDryPost(token, {
      text,
      writerCost: 0.000229,
      inputTokens: 412,
      outputTokens: 63,
    });

    expect(created().data.outcome).toBe(PostOutcome.dry);
  });

  it("createDryPost writes the row once and never resolves it, because X was not called and there is no answer to wait for", () => {
    createDryPost(token, {
      text,
      writerCost: 0.000229,
      inputTokens: 412,
      outputTokens: 63,
    });

    expect(prismaMock.post.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.post.update).not.toHaveBeenCalled();
  });

  it("createDryPost records the model's charge and leaves X's at its default of zero, because an attempt that never reached X carries no figure it did not incur", () => {
    createDryPost(token, {
      text,
      writerCost: 0.000229,
      inputTokens: 412,
      outputTokens: 63,
    });

    expect(created().data.writerCost).toBe(0.000229);
    expect(created().data.xCost).toBeUndefined();
  });
});

describe("posts.repo, reading what the agent already said", () => {
  it("findRecentPostsByToken returns the published and the dry, because both are text the agent produced and a dry run left out would leave the writer repeating itself every slot", () => {
    findRecentPostsByToken(token, 10);

    expect(found().where.outcome).toEqual({
      in: [PostOutcome.published, PostOutcome.dry],
    });
  });

  it("findRecentPostsByToken leaves out the failed and the unresolved, so an attempt that produced nothing anyone saw is never fed back as something the account already said", () => {
    findRecentPostsByToken(token, 10);

    expect(found().where.outcome.in).not.toContain(PostOutcome.failed);
    expect(found().where.outcome.in).not.toContain(PostOutcome.unresolved);
  });

  it("findRecentPostsByToken reads the token it was handed, so one agent is never shown another agent's history", () => {
    findRecentPostsByToken(other, 10);

    expect(found().where.token).toBe(other);
  });

  it("findRecentPostsByToken orders newest first, which is what makes the rows it returns the most recent ones", () => {
    findRecentPostsByToken(token, 10);

    expect(found().orderBy).toEqual({ createdAt: "desc" });
  });

  it("findRecentPostsByToken takes the limit it was handed rather than a count of its own, because how many posts the writer sees is a rule of the domain above it", () => {
    findRecentPostsByToken(token, 3);

    expect(found().take).toBe(3);
  });

  it("findRecentPostsByToken selects the text alone, because the writer is told what the account has already said and nothing about what it cost", () => {
    findRecentPostsByToken(token, 10);

    expect(found().select).toEqual({ text: true });
  });
});

describe("posts.repo, keeping every row", () => {
  it("no operation in the posts data model removes a row, and none is offered, because AI Launchpad keeps its record of what an agent published whatever X obliges an app to delete", async () => {
    createUnresolvedPost(token, { text });
    updatePostPublished(id, published);
    updatePostFailed(id, "X refused the post on policy");
    findRecentPostsByToken(token, 10);

    const repo = await import("@/features/core/posts/posts.repo");

    expect(prismaMock.post.delete).not.toHaveBeenCalled();
    expect(prismaMock.post.deleteMany).not.toHaveBeenCalled();
    expect(Object.keys(repo).filter((name) => /delete|remove|purge/i.test(name))).toEqual(
      [],
    );
  });
});
