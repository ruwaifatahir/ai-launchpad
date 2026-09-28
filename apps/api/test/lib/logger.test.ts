import { describe, expect, it, vi } from "vitest";

// The one file that unmocks the logger, because test/setup.ts replaces it
// everywhere else and the module under test is never mocked.
vi.unmock("@/lib/logger");

const { logger } = await import("@/lib/logger");

// Winston applies its formats before pushing, so the object a data listener
// receives is the line as it would ship.
const shipped = (write: () => void) =>
  new Promise<Record<string, unknown>>((resolve) => {
    logger.once("data", resolve);
    write();
  });

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e";

describe("logger", () => {
  it("ships the token address, which is the only thing naming which agent a poster line is about", async () => {
    const line = await shipped(() => logger.info("post published", { token }));

    expect(line.token).toBe(token);
  });

  it("redacts the access credential, under the name the connections feature stores it as", async () => {
    const line = await shipped(() =>
      logger.info("connection renewed", { accessCredential: "an-access-credential" }),
    );

    expect(line.accessCredential).toBe("[REDACTED]");
  });

  it("redacts the refresh credential, which outlives the access one and is worth more", async () => {
    const line = await shipped(() =>
      logger.info("connection renewed", { refreshCredential: "a-refresh-credential" }),
    );

    expect(line.refreshCredential).toBe("[REDACTED]");
  });

  it("redacts every other name a bearer artefact is held under here", async () => {
    const line = await shipped(() =>
      logger.info("session opened", {
        credential: "a-credential",
        password: "a-password",
        authorization: "a-header",
        apiKey: "a-key",
        secret: "a-secret",
      }),
    );

    expect(line).toMatchObject({
      credential: "[REDACTED]",
      password: "[REDACTED]",
      authorization: "[REDACTED]",
      apiKey: "[REDACTED]",
      secret: "[REDACTED]",
    });
  });
});
