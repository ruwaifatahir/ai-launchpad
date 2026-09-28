import "dotenv/config";
import { parseEnv } from "@/config/env.schema";

// What each variable must be is in src/config/env.schema.ts. This file reads
// process.env through it once, at import, and refuses to boot on anything wrong.
const parsed = parseEnv(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.errors);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
