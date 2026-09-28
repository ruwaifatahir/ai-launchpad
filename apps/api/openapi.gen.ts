import fs from "fs";

import { swaggerSpec } from "./src/config/swagger";

// The runtime image carries dist/ and no src/, so swagger-jsdoc has nothing to read there
// and every route disappears from /api-docs while the page still renders its tags. This
// runs in the build stage, where src/ is present, and writes the spec the image serves.
// An empty result throws rather than writing: a spec with no paths is the silent failure
// this file exists to stop, and a build is the last place that can still catch it.

const spec = swaggerSpec as { paths?: Record<string, unknown> };
const routeCount = Object.keys(spec.paths ?? {}).length;

if (routeCount === 0) {
  throw new Error(
    "swagger-jsdoc found no routes to document. Check the globs in src/config/swagger.ts.",
  );
}

fs.writeFileSync("openapi.json", JSON.stringify(spec, null, 2));

console.log(`openapi.json written: ${routeCount} paths`);
