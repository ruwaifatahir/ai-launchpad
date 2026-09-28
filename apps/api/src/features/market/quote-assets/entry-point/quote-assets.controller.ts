import type { Request, Response } from "express";
import { sendOk } from "@/shared";
import { MARKET_CACHE_CONTROL } from "@/features/market/cache";
import { listQuoteAssets } from "@/features/market/quote-assets/listing";

export const getQuoteAssets = async (_req: Request, res: Response) => {
  const data = await listQuoteAssets();
  res.set("Cache-Control", MARKET_CACHE_CONTROL);
  sendOk(res, data);
};
