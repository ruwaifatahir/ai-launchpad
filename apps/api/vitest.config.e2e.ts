import { defineConfig } from "vitest/config";
import { resolve } from "path";

// The third layer. It loads no setup file on purpose: test/setup.ts mocks the five
// infrastructure modules, and reaching the real Redis, the real node and the real
// rate limiter is the entire reason this layer exists. Run it with pnpm test:e2e.
//
// fileParallelism is off so two suites cannot race each other over the same keys,
// and the timeout is raised because a real round trip is slower than a mock.
export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    include: ["test/e2e/**/*.e2e.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "@test": resolve(import.meta.dirname, "test"),
    },
  },
});
