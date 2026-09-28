import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // scripts/ is in .gitignore: local X API scratch files, not project source.
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "scripts/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain .mjs files are the manual harness side effect scripts. typescript-eslint turns
    // no-undef off for .ts, so only these need to be told they run under Node.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", URL: "readonly" },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", disallowTypeAnnotations: false },
      ],
      eqeqeq: ["error", "always"],
      "no-console": "error",
    },
  },
  {
    // The rules that need the type checker, on the application only. A promise nobody
    // awaits is a rejection nobody handles, and in a request that is a hung response
    // or a crashed process.
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    // Scripts and tests talk to a terminal on purpose, and env.ts reports a bad
    // configuration before the logger, which reads that configuration, can exist.
    files: ["openapi.gen.ts", "src/config/env.ts", "test/**/*.ts", "**/*.mjs"],
    rules: { "no-console": "off" },
  },
);
