import { z } from "zod";
import { chainAddress } from "@/lib/chain/address";

const token = chainAddress;

const version = z.number().int().positive();

// X hands these back through a browser, so each is bounded before anything reads or
// logs it. The state AI Launchpad issues is 43 characters, and X's code and error fall well
// inside their bounds.
const state = z.string().min(1).max(128);

export const connectionParamsSchema = z.object({
  params: z.object({ token }),
});

export const agreeConsentSchema = z.object({
  params: connectionParamsSchema.shape.params,
  body: z.strictObject({ version }),
});

export const attestationSchema = z.object({
  params: connectionParamsSchema.shape.params,
  body: z.strictObject({}),
});

export const callbackSchema = z.object({
  query: z.union([
    z.object({ state, code: z.string().min(1).max(512) }),
    z.object({ state, error: z.string().min(1).max(256) }),
  ]),
});

export type ConnectionParams = z.infer<typeof connectionParamsSchema>["params"];
export type AgreeConsentInput = z.infer<typeof agreeConsentSchema>["body"];
export type CallbackQuery = z.infer<typeof callbackSchema>["query"];
