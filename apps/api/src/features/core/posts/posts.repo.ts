import { PostOutcome, type Prisma } from "@prisma/client";
import prisma from "@/config/database";

export const createUnresolvedPost = (
  token: string,
  data: Omit<Prisma.PostCreateInput, "token" | "outcome" | "xPostId" | "reason">,
) => prisma.post.create({ data: { ...data, token, outcome: PostOutcome.unresolved } });

export const updatePostPublished = (
  id: string,
  result: Pick<
    Prisma.PostCreateInput,
    "xPostId" | "xCost" | "writerCost" | "inputTokens" | "outputTokens"
  >,
) =>
  prisma.post.update({
    where: { id },
    data: { ...result, outcome: PostOutcome.published },
  });

export const updatePostFailed = (id: string, reason: string) =>
  prisma.post.update({ where: { id }, data: { outcome: PostOutcome.failed, reason } });

export const createDryPost = (
  token: string,
  data: Omit<
    Prisma.PostCreateInput,
    "token" | "outcome" | "xPostId" | "reason" | "xCost"
  >,
) => prisma.post.create({ data: { ...data, token, outcome: PostOutcome.dry } });

export const findRecentPostsByToken = (token: string, limit: number) =>
  prisma.post.findMany({
    where: { token, outcome: { in: [PostOutcome.published, PostOutcome.dry] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { text: true },
  });
