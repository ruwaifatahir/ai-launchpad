import type { Request, Response } from "express";
import { sendOk, zParse } from "@/shared";
import { previewParamsSchema } from "@/features/core/previews/domain/schema";
import {
  readPreviewAllowance,
  takePreview,
} from "@/features/core/previews/domain/previewing";

export const postPreview = async (req: Request, res: Response) => {
  const { params } = await zParse(previewParamsSchema, req);
  const data = await takePreview(params);
  sendOk(res, data);
};

export const getPreviewAllowance = async (req: Request, res: Response) => {
  const { params } = await zParse(previewParamsSchema, req);
  const data = await readPreviewAllowance(params);
  sendOk(res, data);
};
