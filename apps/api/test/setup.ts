import { vi } from "vitest";

// The five infrastructure modules are mocked here once and never again per file.
// Mocking @/config/env is also what stops the process.exit(1) in the real module
// from killing the worker instead of failing a test.
//
// @/lib/encryption/cipher is the one src/lib client a feature test does not mock.
// A test that mocked it would leave nothing anywhere proving a stored credential
// is ciphertext, which is the whole point of encrypting one.

vi.mock("@/config/env", async () => {
  const { TEST_ENV } = await import("@test/helpers/env.mock");

  return {
    env: new Proxy(TEST_ENV, {
      get: (target, property) => (property in target ? target[property as string] : ""),
    }),
  };
});

vi.mock("@/config/database", async () => ({
  default: (await import("@test/helpers/prisma.mock")).prismaMock,
}));

vi.mock("@/lib/redis/client", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    getdel: vi.fn(),
    del: vi.fn(),
    call: vi.fn().mockResolvedValue("OK"),
    quit: vi.fn(),
  },
  cacheRedis: {
    get: vi.fn(),
    setex: vi.fn(),
    quit: vi.fn(),
  },
}));

vi.mock("@/middleware/rate-limiter", () => {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    limiter: passthrough,
    makeLimiter: () => passthrough,
    sessionKey: () => "",
    ipKey: () => "",
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
