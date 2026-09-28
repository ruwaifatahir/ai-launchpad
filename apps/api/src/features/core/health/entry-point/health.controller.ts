import type { Request, Response } from "express";
import { sendOk } from "@/shared";
import { checkReadiness } from "@/features/core/health/readiness";

export const getHealth = async (_req: Request, res: Response) => {
  const data = await checkReadiness();
  sendOk(res, data);
};
