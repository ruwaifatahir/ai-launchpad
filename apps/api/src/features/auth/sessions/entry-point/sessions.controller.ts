import type { Request, Response } from "express";
import { sendCreated, sendOk, zParse } from "@/shared";
import { verifySessionSchema } from "@/features/auth/sessions/domain/schema";
import { issueNonce } from "@/features/auth/sessions/domain/nonce";
import { openSession } from "@/features/auth/sessions/domain/verification";

export const getNonce = async (_req: Request, res: Response) => {
  const data = await issueNonce();
  sendOk(res, data);
};

export const postSession = async (req: Request, res: Response) => {
  const { body } = await zParse(verifySessionSchema, req);
  const data = await openSession(body);
  sendCreated(res, data);
};

export const getCurrentSession = (req: Request, res: Response) => {
  sendOk(res, { wallet: req.session.wallet });
};
