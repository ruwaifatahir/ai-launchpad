import type { Request, Response } from "express";
import { sendOk } from "@/shared";
import { MARKET_CACHE_CONTROL } from "@/features/market/cache";
import { readAnalytics } from "@/features/market/analytics/summary";

export const getAnalytics = async (_req: Request, res: Response) => {
  const data = await readAnalytics();
  res.set("Cache-Control", MARKET_CACHE_CONTROL);
  sendOk(res, data);
};
