import { z } from "zod";
import { pageQuery, tokenParams } from "@/features/market/request";

export const holdersRequestSchema = z.object({
  params: tokenParams,
  query: z.object({ page: pageQuery }),
});

export type HoldersRequest = z.infer<typeof holdersRequestSchema>;
