import type { Request, Response } from "express";
import { sendOk, zParse } from "@/shared";
import { MARKET_CACHE_CONTROL } from "@/features/market/cache";
import { chartRequestSchema } from "@/features/market/chart/domain/schema";
import { chartToken } from "@/features/market/chart/domain/charting";

export const getChart = async (req: Request, res: Response) => {
  const request = await zParse(chartRequestSchema, req);
  const data = await chartToken(request);
  res.set("Cache-Control", MARKET_CACHE_CONTROL);
  sendOk(res, data);
};
