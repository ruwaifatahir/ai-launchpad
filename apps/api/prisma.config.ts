import "dotenv/config";
import { defineConfig } from "@prisma/config";

// Points the CLI at the prisma/ directory, not at a single file. Pointing it at
// prisma/schema.prisma would silently load only that file and drop every model
// under prisma/models/ from the generated client.
export default defineConfig({
  schema: "prisma",
});
