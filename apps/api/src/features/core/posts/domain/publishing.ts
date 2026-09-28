import type { Address } from "viem";
import { env } from "@/config/env";
import {
  ModelRefusedError,
  ModelUnreachableError,
  ModelUnusableError,
  costsOf,
} from "@/lib/ai/client";
import { logger } from "@/lib/logger";
import {
  XCredentialDeadError,
  XPostRefusedError,
  XRateLimitedError,
  createPost,
} from "@/lib/x/posting";
import { XUnreachableError } from "@/lib/x/transport";
import { findAgentByToken } from "@/features/core/agents/agents.repo";
import { hasCompletePersona } from "@/features/core/agents/domain/persona";
import { readLiveCredential } from "@/features/core/connections/domain/renewal";
import { readSilenceReason } from "@/features/core/posts/domain/eligibility";
import { RECENT_POSTS, writePost } from "@/features/core/posts/domain/writing";
import {
  createDryPost,
  createUnresolvedPost,
  findRecentPostsByToken,
  updatePostFailed,
  updatePostPublished,
} from "@/features/core/posts/posts.repo";

const GRADUATED = new Date(0);

const X_POST_COST = 0.015;

export const publishPost = async (token: Address) => {
  const reason = await readSilenceReason(token, GRADUATED);

  if (reason) {
    logger.warn("slot skipped, the agent may not publish", { token, reason });

    return;
  }

  const accessCredential = await readLiveCredential(token);

  if (!accessCredential) {
    logger.warn("slot skipped, no live credential", { token });

    return;
  }

  const agent = await findAgentByToken(token);

  if (!hasCompletePersona(agent)) {
    logger.warn("slot skipped, the persona lost a part", { token });

    return;
  }

  const recent = await findRecentPostsByToken(token, RECENT_POSTS);

  const draft = await writePost({
    token,
    name: agent.name,
    personality: agent.personality,
    lore: agent.lore,
    style: agent.style,
    topics: agent.topics,
    recentPosts: recent.map((post) => post.text),
  }).catch((cause: unknown) => {
    if (cause instanceof ModelUnreachableError) {
      logger.warn("slot skipped, the model could not be reached", { token, cause });

      return null;
    }

    if (cause instanceof ModelRefusedError) {
      logger.error("slot skipped, the model refused this persona", { token, cause });

      return null;
    }

    if (cause instanceof ModelUnusableError) {
      logger.error("slot skipped, the model answered with nothing usable", {
        token,
        cause,
      });

      return null;
    }

    throw cause;
  });

  if (!draft) return;

  if (env.X_DRY_RUN) {
    await createDryPost(token, { text: draft.text, ...costsOf(draft) });

    logger.info("dry run, nothing sent to x", { token, text: draft.text });

    return;
  }

  const post = await createUnresolvedPost(token, { text: draft.text });

  try {
    const xPostId = await createPost({ accessCredential, text: draft.text });

    await updatePostPublished(post.id, {
      xPostId,
      xCost: X_POST_COST,
      ...costsOf(draft),
    });

    logger.info("post published", { token, xPostId });
  } catch (cause) {
    if (cause instanceof XCredentialDeadError) {
      await updatePostFailed(post.id, cause.message);

      logger.warn("slot skipped, x no longer accepts this credential", { token, cause });

      return;
    }

    if (cause instanceof XPostRefusedError) {
      await updatePostFailed(post.id, cause.message);

      logger.error("slot skipped, x refused this post", { token, cause });

      return;
    }

    if (cause instanceof XRateLimitedError) {
      await updatePostFailed(post.id, cause.message);

      logger.warn("slot skipped, x is taking no more posts", { token, cause });

      return;
    }

    if (cause instanceof XUnreachableError) {
      await updatePostFailed(post.id, cause.message);

      logger.warn("slot skipped, x could not be reached", { token, cause });

      return;
    }

    throw cause;
  }
};
