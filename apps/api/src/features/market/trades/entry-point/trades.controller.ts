import type { Request, Response } from "express";
import { sendOk, zParse } from "@/shared";
import { MARKET_CACHE_CONTROL } from "@/features/market/cache";
import { tradesRequestSchema } from "@/features/market/trades/domain/schema";
import { listTrades } from "@/features/market/trades/domain/listing";

export const getTrades = async (req: Request, res: Response) => {
  const request = await zParse(tradesRequestSchema, req);
  const data = await listTrades(request);
  res.set("Cache-Control", MARKET_CACHE_CONTROL);
  sendOk(res, data);
};
