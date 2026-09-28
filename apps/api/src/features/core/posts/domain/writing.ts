import type { Address } from "viem";
import { generatePost } from "@/lib/ai/client";
import { logger } from "@/lib/logger";

export const RECENT_POSTS = 10;

const POST_LENGTH_MAX = 280;

const MENTION = /@\w/;
const LINK = /https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}/i;

const publishable = (text: string) =>
  text.trim().length > 0 &&
  text.length <= POST_LENGTH_MAX &&
  !MENTION.test(text) &&
  !LINK.test(text);

export const writePost = async ({
  token,
  name,
  personality,
  lore,
  style,
  topics,
  recentPosts,
}: {
  token: Address;
  name: string;
  personality: string;
  lore: string;
  style: string;
  topics: string[];
  recentPosts: string[];
}) => {
  const message = [
    `You are ${name}.`,
    `Personality: ${personality}`,
    `Backstory: ${lore}`,
    `Writing style: ${style}`,
    topics.length > 0 ? `Speak to one of these subjects: ${topics.join(", ")}` : "",
    recentPosts.length > 0
      ? `You posted these recently, so say something you have not said yet:\n${recentPosts
          .map((post) => `- ${post}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const first = await generatePost(message);

  if (publishable(first.text)) return first;

  const second = await generatePost(message);

  if (publishable(second.text))
    return {
      text: second.text,
      inputTokens: first.inputTokens + second.inputTokens,
      outputTokens: first.outputTokens + second.outputTokens,
    };

  logger.error("draft rejected twice, nothing published", { token });

  return null;
};
