import type { Request, Response } from "express";
import { sendOk, zParse } from "@/shared";
import { MARKET_CACHE_CONTROL } from "@/features/market/cache";
import {
  creatorRequestSchema,
  exploreRequestSchema,
  graduatedRequestSchema,
  searchRequestSchema,
} from "@/features/market/tokens/domain/schema";
import { listCreatorTokens } from "@/features/market/tokens/domain/creator";
import { listExplore } from "@/features/market/tokens/domain/explore";
import { listGraduated } from "@/features/market/tokens/domain/graduated";
import { searchTokens } from "@/features/market/tokens/domain/search";

export const getGraduated = async (req: Request, res: Response) => {
  const request = await zParse(graduatedRequestSchema, req);
  const data = await listGraduated(request);
  res.set("Cache-Control", MARKET_CACHE_CONTROL);
  sendOk(res, data);
};

export const getExplore = async (req: Request, res: Response) => {
  const request = await zParse(exploreRequestSchema, req);
  const data = await listExplore(request);
  res.set("Cache-Control", MARKET_CACHE_CONTROL);
  sendOk(res, data);
};

export const getSearch = async (req: Request, res: Response) => {
  const request = await zParse(searchRequestSchema, req);
  const data = await searchTokens(request);
  res.set("Cache-Control", MARKET_CACHE_CONTROL);
  sendOk(res, data);
};

export const getCreatorTokens = async (req: Request, res: Response) => {
  const request = await zParse(creatorRequestSchema, req);
  const data = await listCreatorTokens(request);
  res.set("Cache-Control", MARKET_CACHE_CONTROL);
  sendOk(res, data);
};
