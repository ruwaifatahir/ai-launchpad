import { z } from "zod";
import { pageQuery, tokenParams } from "@/features/market/request";

export const tradesRequestSchema = z.object({
  params: tokenParams,
  query: z.object({ page: pageQuery }),
});

export type TradesRequest = z.infer<typeof tradesRequestSchema>;
