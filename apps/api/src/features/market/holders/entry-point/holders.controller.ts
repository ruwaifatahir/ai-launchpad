import type { Request, Response } from "express";
import { sendOk, zParse } from "@/shared";
import { MARKET_CACHE_CONTROL } from "@/features/market/cache";
import { holdersRequestSchema } from "@/features/market/holders/domain/schema";
import { listHolders } from "@/features/market/holders/domain/listing";

export const getHolders = async (req: Request, res: Response) => {
  const request = await zParse(holdersRequestSchema, req);
  const data = await listHolders(request);
  res.set("Cache-Control", MARKET_CACHE_CONTROL);
  sendOk(res, data);
};
