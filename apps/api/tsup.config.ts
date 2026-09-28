import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  // Some bundled CJS dependencies do a dynamic require(); esbuild's ESM shim
  // throws on those. Inject a real createRequire so they resolve at runtime.
  banner: {
    js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
  },
  clean: true,
});
