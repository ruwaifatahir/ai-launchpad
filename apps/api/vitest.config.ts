import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    // clearMocks wipes call history before each test but keeps the
    // implementation, which is what a module mocked in a vi.mock factory needs:
    // its vi.fn() lives for the whole file, so without this a "was not called"
    // assertion sees calls made by an earlier test.
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ["./test/setup.ts"],
    // test/e2e/** is excluded rather than left to the include pattern, because the
    // default include matches any *.test.ts anywhere. An e2e file that leaked in
    // here would run against the mocks in test/setup.ts and prove nothing.
    exclude: ["node_modules", "dist", "test/e2e/**"],
    // pnpm test:coverage. The thresholds sit just under what the suite reaches
    // today, so a change that lands untested code fails rather than drifting the
    // number down. The entry point is left out: it wires the process together and
    // is proved by booting it, not by a unit test.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types/**"],
      reporter: ["text-summary", "html", "lcov"],
      thresholds: { statements: 95, branches: 92, functions: 92, lines: 95 },
    },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "@test": resolve(import.meta.dirname, "test"),
    },
  },
});
