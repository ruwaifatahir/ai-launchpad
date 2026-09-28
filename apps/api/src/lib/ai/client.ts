import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { env } from "@/config/env";

// The one call that writes. Mastra is used as a library here and nothing else:
// no server, no bundler, no deployer, no playground, and neither its memory nor
// its storage. What a writer needs to avoid repeating itself is the last ten
// posts this agent published, and that arrives as data in the message rather
// than as a second copy of a table the app already owns.
//
// AI_MODEL, which defaults to openai/gpt-5.6-luna. The tier suffix is load
// bearing: the bare gpt-5.6 alias routes to the Sol tier, which is twenty times
// the input price for the same post. The costs below are that default's, so a
// deployment that names another model records its posts at the default's prices.
const MODEL = env.AI_MODEL;

// What can go wrong writing, named here rather than guessed at by each caller.
// None of them carries a status or a sentence for a caller to read, and none of
// them decides what happens to the slot: that is the caller's call.
//
// A misconfigured provider key is not among them. Mastra reads that key from the
// environment itself, so src/config/env.ts requires it at boot and the process
// never starts without one, which is why a failed call here is always about the
// model rather than about us.

export class ModelUnreachableError extends Error {
  constructor(cause: unknown) {
    super("The model could not be reached.", { cause });
    this.name = "ModelUnreachableError";
  }
}

export class ModelRefusedError extends Error {
  constructor(cause: unknown) {
    super("The model refused to write this post.", { cause });
    this.name = "ModelRefusedError";
  }
}

export class ModelUnusableError extends Error {
  constructor(cause: unknown) {
    super("The model answered with nothing that can be published.", { cause });
    this.name = "ModelUnusableError";
  }
}

// One text field, because a raw completion eventually arrives as a sentence
// introducing the post, and that sentence is what would be published.
const draft = z.object({ text: z.string() });

// Built once at import. The instructions are the only fixed part of a post: the
// character, the subjects and what it already said all travel in the message,
// because a persona is data rather than configuration and a fresh agent object
// per post would say otherwise.
const writer = new Agent({
  id: "ai-launchpad-writer",
  name: "AI Launchpad writer",
  instructions:
    "You write a single post for X in the voice of the character described in the message. Answer with the post itself and nothing around it: no preamble, no explanation, no alternatives and no surrounding quotes. Plain text only. Never include a link, never name another account and never write a thread.",
  model: MODEL,
});

// generate rejects for a refused connection, a DNS failure, a deadline and a 5xx
// alike, and a content filter arrives the other way, as an answer that finished
// for that reason. The two are apart because one is worth another attempt and
// the other is the model declining to write this character at all.
//
// The counts come back beside the text, because what a post cost is recorded on
// the post rather than read back from a constant later. A provider that reports
// no usage leaves a zero rather than a guess, so the row says nothing was
// measured instead of naming a figure nobody charged.
export const generatePost = async (prompt: string) => {
  const answer = await writer
    .generate(prompt, { structuredOutput: { schema: draft } })
    .catch((cause: unknown) => {
      throw new ModelUnreachableError(cause);
    });

  if (answer.finishReason === "content-filter") throw new ModelRefusedError(answer);

  const written = draft.safeParse(answer.object);

  if (!written.success) throw new ModelUnusableError(answer.object);

  return {
    text: written.data.text,
    inputTokens: answer.usage?.inputTokens ?? 0,
    outputTokens: answer.usage?.outputTokens ?? 0,
  };
};

// What the default model charges, per token, in dollars. It lives beside MODEL
// because it is a property of that model rather than a rule about posting: change
// the default and these two numbers change with it. Both features that write
// through this client read them from here, so a price change is one edit and
// neither caller can drift from the other.
//
// Rounded to eight places because a single post costs around $0.0004 and fewer
// places record every one of them as zero. What X charges is not here: only the
// poster pays X, so that figure stays where it is spent.
const WRITER_INPUT_COST = 0.00000025;

const WRITER_OUTPUT_COST = 0.000002;

const COST_PLACES = 8;

export const costsOf = (draft: { inputTokens: number; outputTokens: number }) => ({
  writerCost: Number(
    (
      draft.inputTokens * WRITER_INPUT_COST +
      draft.outputTokens * WRITER_OUTPUT_COST
    ).toFixed(COST_PLACES),
  ),
  inputTokens: draft.inputTokens,
  outputTokens: draft.outputTokens,
});
