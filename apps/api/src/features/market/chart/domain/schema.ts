import { z } from "zod";
import { tokenParams } from "@/features/market/request";

export const CHART_RANGES = ["5m", "1h", "6h", "1d", "all"] as const;

export const chartRequestSchema = z.object({
  params: tokenParams,
  query: z.object({
    range: z.enum(CHART_RANGES),
  }),
});

export type ChartRequest = z.infer<typeof chartRequestSchema>;
export type ChartRange = (typeof CHART_RANGES)[number];
