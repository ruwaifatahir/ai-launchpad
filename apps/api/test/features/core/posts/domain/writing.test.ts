import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/client", () => ({ generatePost: vi.fn() }));

import { generatePost } from "@/lib/ai/client";
import { logger } from "@/lib/logger";
import { writePost } from "@/features/core/posts/domain/writing";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;

const persona = {
  token,
  name: "Vex",
  personality: "certain about everything and short about it",
  lore: "woke up inside a sealed archive and never left",
  style: "lower case, no hashtags, one thought at a time",
  topics: ["market structure", "liquidity"],
  recentPosts: ["the first thing it ever said", "the second thing it ever said"],
};

const clean = "a draft with nothing wrong with it";

const written = (text: string, attempt = 0) => ({
  text,
  inputTokens: 400 + attempt,
  outputTokens: 60 + attempt,
});

const drafts = (...texts: string[]) => {
  texts.forEach((text, attempt) =>
    vi.mocked(generatePost).mockResolvedValueOnce(written(text, attempt)),
  );
};

const prompt = () => vi.mocked(generatePost).mock.calls[0][0];

const rejectedThenAccepted = (rejected: string) => {
  drafts(rejected, clean);

  return writePost(persona);
};

describe("writePost", () => {
  beforeEach(() => {
    vi.mocked(generatePost).mockReset();
    vi.mocked(generatePost).mockResolvedValue(written(clean));
  });

  it("carries all four persona parts into the prompt, because the character the creator wrote is the one that has to speak", async () => {
    await writePost(persona);

    expect(prompt()).toContain(persona.name);
    expect(prompt()).toContain(persona.personality);
    expect(prompt()).toContain(persona.lore);
    expect(prompt()).toContain(persona.style);
  });

  it("carries every topic rather than a sample of them, so the subjects the creator chose are all in reach", async () => {
    await writePost(persona);

    expect(prompt()).toContain("market structure");
    expect(prompt()).toContain("liquidity");
  });

  it("carries the recent posts it was handed, so the account does not read as a loop", async () => {
    await writePost(persona);

    expect(prompt()).toContain("the first thing it ever said");
    expect(prompt()).toContain("the second thing it ever said");
  });

  it("writes from a complete persona with no topics, because topics narrow the subject matter rather than authorise the agent", async () => {
    await expect(writePost({ ...persona, topics: [] })).resolves.toMatchObject({
      text: clean,
    });
    expect(prompt()).not.toContain("subjects");
  });

  it("asks an agent that has published nothing to differ from nothing, so a first post carries no empty history", async () => {
    await writePost({ ...persona, recentPosts: [] });

    expect(prompt()).not.toContain("recently");
  });

  it("publishes a draft that passes every check on the first attempt, so an ordinary post costs one model call", async () => {
    await expect(writePost(persona)).resolves.toMatchObject({ text: clean });
    expect(generatePost).toHaveBeenCalledTimes(1);
  });

  it("reports what the one call consumed and produced, so the caller records a cost that was charged rather than one it assumed", async () => {
    drafts(clean);

    await expect(writePost(persona)).resolves.toMatchObject({
      inputTokens: 400,
      outputTokens: 60,
    });
  });

  it("adds up every attempt it made, because a rejected draft was charged for and a figure naming only the published one understates what the slot cost", async () => {
    drafts("a".repeat(281), clean);

    await expect(writePost(persona)).resolves.toMatchObject({
      text: clean,
      inputTokens: 801,
      outputTokens: 121,
    });
  });

  it("rejects a draft naming an account, because X blocks a cold mention and the consent promised it never happens", async () => {
    await expect(
      rejectedThenAccepted("morning @someone, thoughts?"),
    ).resolves.toMatchObject({ text: clean });
  });

  it("rejects a draft carrying a link, because the consent promised no link and a post with one costs thirteen times as much", async () => {
    await expect(
      rejectedThenAccepted("the whole story: https://example.com/x"),
    ).resolves.toMatchObject({ text: clean });
  });

  it("rejects a draft carrying a bare domain, because X turns one into a link exactly as it turns a written out URL into one", async () => {
    await expect(
      rejectedThenAccepted("the whole story is at example.com"),
    ).resolves.toMatchObject({ text: clean });
  });

  it("rejects a draft longer than the post limit, because X refuses anything longer", async () => {
    await expect(rejectedThenAccepted("a".repeat(281))).resolves.toMatchObject({
      text: clean,
    });
  });

  it("publishes a draft of exactly the post limit, because the limit is the length X refuses beyond rather than the length it refuses", async () => {
    drafts("b".repeat(280));

    await expect(writePost(persona)).resolves.toMatchObject({ text: "b".repeat(280) });
  });

  it("rejects a draft that is only whitespace, because nothing is published from an empty draft", async () => {
    await expect(rejectedThenAccepted("   \n  ")).resolves.toMatchObject({ text: clean });
  });

  // Each of the three below fails its drafts against a different check, so no one
  // check can be removed from the source without the failure pointing at the check
  // rather than at the retry, the log or the prompt.
  it("writes one more draft and no further, so a second failure skips the slot rather than looping at a cent a turn", async () => {
    drafts("a".repeat(281), "b".repeat(281));

    await expect(writePost(persona)).resolves.toBeNull();
    expect(generatePost).toHaveBeenCalledTimes(2);
  });

  it("logs at error when both drafts fail, because there is no screen anywhere showing that an agent went silent", async () => {
    drafts("morning @someone", "morning again @someone");

    await writePost(persona);

    expect(logger.error).toHaveBeenCalledWith(expect.any(String), { token });
  });

  it("never shows the failed draft to the writer, because no reader ever saw it and feeding it back anchors the next one on it", async () => {
    drafts("read more at https://example.com", clean);

    await writePost(persona);

    const [first, second] = vi.mocked(generatePost).mock.calls;

    expect(second[0]).toBe(first[0]);
    expect(second[0]).not.toContain("example.com");
  });

  it("lets a model failure through rather than writing again, because the retry answers a draft that failed the checks and not a draft that was never written", async () => {
    vi.mocked(generatePost).mockRejectedValue(
      new Error("the model could not be reached"),
    );

    await expect(writePost(persona)).rejects.toThrow();
    expect(generatePost).toHaveBeenCalledTimes(1);
  });
});
