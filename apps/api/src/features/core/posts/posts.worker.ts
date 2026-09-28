import type { Job } from "bullmq";
import { POST_JOB, postsQueue } from "@/lib/jobs/queue";
import { publishPost } from "@/features/core/posts/domain/publishing";
import { claimDueSlots } from "@/features/core/posts/domain/scheduling";
import { postJobSchema } from "@/features/core/posts/domain/schema";

export const runPostsTick = async () => {
  const tokens = await claimDueSlots();

  await postsQueue.addBulk(tokens.map((token) => ({ name: POST_JOB, data: { token } })));
};

export const runPostJob = async (job: Job) => {
  const { token } = postJobSchema.parse(job.data);

  await publishPost(token);
};
