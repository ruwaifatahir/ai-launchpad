import { beforeEach, describe, expect, it, vi } from "vitest";

const { built, generate } = vi.hoisted(() => ({
  built: [] as Record<string, unknown>[],
  generate: vi.fn(),
}));

// A class rather than a vi.fn, because the module under test constructs its agent
// once at import and clearMocks would wipe a spy's record of that one call before
// the first test ever runs. built is a plain array, so it survives.
vi.mock("@mastra/core/agent", () => ({
  Agent: class {
    generate = generate;

    constructor(config: Record<string, unknown>) {
      built.push(config);
    }
  },
}));

import {
  ModelRefusedError,
  ModelUnreachableError,
  ModelUnusableError,
  generatePost,
} from "@/lib/ai/client";

const answered = (answer: Record<string, unknown>) => ({
  text: "Sure! Here is a post for you:",
  finishReason: "stop",
  object: { text: "the post the agent wrote" },
  usage: { inputTokens: 412, outputTokens: 63 },
  ...answer,
});

const asked = () =>
  generate.mock.calls[0] as [string, { structuredOutput: { schema: unknown } }];

describe("generatePost", () => {
  beforeEach(() => {
    generate.mockResolvedValue(answered({}));
  });

  it("writes with the model AI_MODEL names, so a deployment chooses its model without a code change", () => {
    expect(built[0].model).toBe("openai/gpt-5.6-luna");
  });

  it("builds one agent for the whole process, because a persona is data that travels in the message rather than configuration bound to an agent", async () => {
    await generatePost("the first prompt");
    await generatePost("the second prompt");

    expect(built).toHaveLength(1);
  });

  it("carries fixed instructions to write a single X post, so the one thing every post has in common is not repeated in every prompt", () => {
    expect(built[0].instructions).toEqual(expect.stringContaining("single post for X"));
  });

  it("sends the prompt it was handed and builds none of its own, because turning a persona into a prompt is a business rule rather than infrastructure", async () => {
    await generatePost("the prompt the domain built");

    expect(asked()[0]).toBe("the prompt the domain built");
  });

  it("asks for structured output carrying one text field, because a raw completion arrives as a sentence introducing the post and that sentence is what would be published", async () => {
    await generatePost("the prompt");

    const schema = asked()[1].structuredOutput.schema as {
      safeParse: (value: unknown) => { success: boolean };
    };

    expect(schema.safeParse({ text: "the post" }).success).toBe(true);
    expect(schema.safeParse({ post: "the post" }).success).toBe(false);
  });

  it("hands back the text field alone, so the sentence the model wrapped it in is never published", async () => {
    await expect(generatePost("the prompt")).resolves.toMatchObject({
      text: "the post the agent wrote",
    });
  });

  it("hands back what the call consumed and produced, because what a post cost is recorded on the post rather than estimated from a constant later", async () => {
    await expect(generatePost("the prompt")).resolves.toMatchObject({
      inputTokens: 412,
      outputTokens: 63,
    });
  });

  it("counts nothing as zero when the provider reported no usage, so a row never carries a figure nobody measured", async () => {
    generate.mockResolvedValue(answered({ usage: undefined }));

    await expect(generatePost("the prompt")).resolves.toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it("names a model that never answered, because a refused connection, a dead name and a deadline are all the same wait to a caller", async () => {
    const cause = new Error("fetch failed");
    generate.mockRejectedValue(cause);

    await expect(generatePost("the prompt")).rejects.toBeInstanceOf(
      ModelUnreachableError,
    );
    await expect(generatePost("the prompt")).rejects.toMatchObject({ cause });
  });

  it("names a refusal on the model's own content filter, which arrives as a finished answer rather than as a failure", async () => {
    generate.mockResolvedValue(answered({ finishReason: "content-filter" }));

    await expect(generatePost("the prompt")).rejects.toBeInstanceOf(ModelRefusedError);
  });

  it("names a refusal even when an object came back with it, because a filtered answer is not a post whatever it carries", async () => {
    generate.mockResolvedValue(
      answered({ finishReason: "content-filter", object: { text: "the post" } }),
    );

    await expect(generatePost("the prompt")).rejects.toBeInstanceOf(ModelRefusedError);
  });

  it("names an answer carrying no object, so nothing usable is never mistaken for an outage worth waiting on", async () => {
    generate.mockResolvedValue(answered({ object: undefined }));

    await expect(generatePost("the prompt")).rejects.toBeInstanceOf(ModelUnusableError);
  });

  it("names an answer whose text field is not text, because a broken response must never reach X", async () => {
    generate.mockResolvedValue(answered({ object: { text: 12 } }));

    await expect(generatePost("the prompt")).rejects.toBeInstanceOf(ModelUnusableError);
  });

  it("raises nothing for an ordinary answer, so the three named failures stay failures rather than a description of every call", async () => {
    generate.mockResolvedValue(answered({ finishReason: "length" }));

    await expect(generatePost("the prompt")).resolves.toMatchObject({
      text: "the post the agent wrote",
    });
  });
});
