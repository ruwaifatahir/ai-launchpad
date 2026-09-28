import { ApiError } from "@/shared";
import {
  ModelRefusedError,
  ModelUnreachableError,
  ModelUnusableError,
  costsOf,
} from "@/lib/ai/client";
import { readTokenGraduation } from "@/features/core/graduations/reading";
import { logger } from "@/lib/logger";
import { findAgentByToken } from "@/features/core/agents/agents.repo";
import { hasCompletePersona } from "@/features/core/agents/domain/persona";
import { RECENT_POSTS, writePost } from "@/features/core/posts/domain/writing";
import { findRecentPostsByToken } from "@/features/core/posts/posts.repo";
import type { PreviewParams } from "@/features/core/previews/domain/schema";
import {
  addPreviewSpend,
  decrementPreviewCount,
  findPreviewCountByTokenAndDay,
  incrementPreviewCount,
} from "@/features/core/previews/previews.repo";

const ALLOWANCE = 20;

const DAY_MS = 86_400_000;

const utcDay = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

const nextUtcMidnight = (now: Date) => new Date(utcDay(now).getTime() + DAY_MS);

export const takePreview = async (params: PreviewParams) => {
  const now = new Date();
  const day = utcDay(now);

  const [agent, graduatedAt] = await Promise.all([
    findAgentByToken(params.token),
    readTokenGraduation(params.token),
  ]);

  if (agent?.stoppedAt)
    throw ApiError.conflict(
      "An AI Launchpad admin stopped this agent, so it writes nothing.",
      "AGENT_STOPPED",
    );

  if (!graduatedAt)
    throw ApiError.conflict(
      "This token has not graduated, so its agent writes nothing yet.",
      "TOKEN_NOT_GRADUATED",
    );

  if (!hasCompletePersona(agent))
    throw ApiError.conflict(
      "Finish the persona first. The name, the personality, the lore and the style are all needed.",
      "PERSONA_INCOMPLETE",
    );

  const taken = await incrementPreviewCount(params.token, day);

  if (taken > ALLOWANCE) {
    await decrementPreviewCount(params.token, day);

    throw ApiError.tooManyRequests(
      "You have taken every preview this agent gets today. The allowance resets at midnight UTC.",
      "PREVIEW_ALLOWANCE_SPENT",
    );
  }

  const recent = await findRecentPostsByToken(params.token, RECENT_POSTS);

  const drafted = await writePost({
    token: params.token,
    name: agent.name,
    personality: agent.personality,
    lore: agent.lore,
    style: agent.style,
    topics: agent.topics,
    recentPosts: recent.map((post) => post.text),
  }).catch(async (cause: unknown) => {
    await decrementPreviewCount(params.token, day);

    if (cause instanceof ModelRefusedError) return "refused" as const;

    if (cause instanceof ModelUnreachableError)
      throw ApiError.unavailable(
        "The writer could not be reached. This preview was not spent.",
        "WRITER_UNAVAILABLE",
      );

    if (cause instanceof ModelUnusableError)
      throw ApiError.unavailable(
        "The writer answered with nothing usable. This preview was not spent.",
        "WRITER_UNAVAILABLE",
      );

    throw cause;
  });

  if (drafted === "refused") {
    logger.warn("preview refused, the writer would not write this persona", {
      token: params.token,
    });

    return {
      text: null,
      reason: "refused",
      allowance: ALLOWANCE,
      remaining: ALLOWANCE - taken + 1,
      resetsAt: nextUtcMidnight(now),
    };
  }

  if (!drafted) {
    await decrementPreviewCount(params.token, day);

    logger.warn("preview unpublishable, two drafts broke the rules a post is held to", {
      token: params.token,
    });

    return {
      text: null,
      reason: "unpublishable",
      allowance: ALLOWANCE,
      remaining: ALLOWANCE - taken + 1,
      resetsAt: nextUtcMidnight(now),
    };
  }

  const spend = costsOf(drafted);

  await addPreviewSpend(params.token, day, spend);

  logger.info("preview written", { token: params.token, ...spend });

  return {
    text: drafted.text,
    reason: null,
    allowance: ALLOWANCE,
    remaining: ALLOWANCE - taken,
    resetsAt: nextUtcMidnight(now),
  };
};

export const readPreviewAllowance = async (params: PreviewParams) => {
  const now = new Date();

  const taken = await findPreviewCountByTokenAndDay(params.token, utcDay(now));

  return {
    allowance: ALLOWANCE,
    remaining: ALLOWANCE - (taken ?? 0),
    resetsAt: nextUtcMidnight(now),
  };
};
