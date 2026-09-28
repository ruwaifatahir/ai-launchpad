import { z } from "zod";
import { chainAddress } from "@/lib/chain/address";

const token = chainAddress;

export const previewParamsSchema = z.object({
  params: z.object({ token }),
});

export type PreviewParams = z.infer<typeof previewParamsSchema>["params"];
