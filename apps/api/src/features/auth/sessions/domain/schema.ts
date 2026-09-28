import { z } from "zod";

const message = z.string().min(1).max(4000);
const signature = z
  .string()
  .max(4000)
  .regex(/^0x([0-9a-fA-F]{2})+$/, "supply a hex signature")
  .transform((value) => value as `0x${string}`);

export const verifySessionSchema = z.object({
  body: z.strictObject({
    message,
    signature,
  }),
});

export type VerifySessionInput = z.infer<typeof verifySessionSchema>["body"];
