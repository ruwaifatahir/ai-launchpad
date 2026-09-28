import type { Request, Response } from "express";
import { sendCreated } from "@/shared";
import { uploadLogo } from "@/features/core/logos/domain/uploading";
import { logoRequired } from "@/features/core/logos/refusals";

export const postLogo = async (req: Request, res: Response) => {
  // Absent when the body was not multipart at all, or carried no file part.
  if (!req.file) throw logoRequired();

  const data = await uploadLogo(req.session.wallet, req.file.buffer);
  sendCreated(res, data);
};
