import type { Response } from "express";
import { ServiceResponse } from "@/shared/models/service-response";

// The two ways this API replies. Every controller uses one of these, so every
// successful response has the same shape: { success, statusCode, message, data }.

export const sendOk = (res: Response, data: unknown) => {
  const response = ServiceResponse.success(data);
  res.status(response.statusCode).json(response);
};

export const sendCreated = (res: Response, data: unknown) => {
  const response = ServiceResponse.created(data);
  res.status(response.statusCode).json(response);
};
