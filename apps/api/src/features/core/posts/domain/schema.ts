import { z } from "zod";
import { chainAddress } from "@/lib/chain/address";

export const postJobSchema = z.strictObject({ token: chainAddress });
