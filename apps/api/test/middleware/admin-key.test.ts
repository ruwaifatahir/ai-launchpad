import { describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";

import { type ApiError } from "@/shared";
import { adminKey } from "@/middleware/admin-key";
import { TEST_ENV } from "@test/helpers/env.mock";

const key = TEST_ENV.ADMIN_API_KEY as string;

const run = (headers: Record<string, unknown>) =>
  new Promise<unknown>((resolve) => {
    adminKey(
      { headers } as unknown as Request,
      {} as Response,
      ((error?: unknown) => resolve(error)) as NextFunction,
    );
  });

const status = (error: unknown) => (error as ApiError).statusCode;

describe("adminKey", () => {
  it("lets the request through when the header carries the configured key", async () => {
    await expect(run({ "x-admin-key": key })).resolves.toBeUndefined();
  });

  it("answers 401 when no key is sent at all, so an admin action is never reachable unauthenticated", async () => {
    expect(status(await run({}))).toBe(401);
  });

  it("answers 401 for a wrong key, so guessing the header name gets a caller no further", async () => {
    expect(status(await run({ "x-admin-key": `${key}-wrong` }))).toBe(401);
  });

  it("answers 401 for a key of the right length differing in its last character, so a near miss is not a pass", async () => {
    expect(status(await run({ "x-admin-key": `${key.slice(0, -1)}X` }))).toBe(401);
  });

  it("answers 401 for a key of the right length differing in its first character, so no prefix of the secret is accepted", async () => {
    expect(status(await run({ "x-admin-key": `X${key.slice(1)}` }))).toBe(401);
  });

  it("answers 401 for an empty key, so a header sent with nothing in it is not the same as the secret", async () => {
    expect(status(await run({ "x-admin-key": "" }))).toBe(401);
  });

  it("answers 401 for a repeated header, because two values are not one credential", async () => {
    expect(status(await run({ "x-admin-key": [key, key] }))).toBe(401);
  });

  it("never reads the authorization header, so no code path can confuse the admin key with a creator's credential", async () => {
    expect(status(await run({ authorization: `Bearer ${key}` }))).toBe(401);
    expect(status(await run({ authorization: key }))).toBe(401);
  });

  it("answers every rejection with the same message, so a caller learns nothing from the shape of the refusal", async () => {
    const messages = await Promise.all(
      [{}, { "x-admin-key": "" }, { "x-admin-key": `${key}-wrong` }].map(
        async (headers) => ((await run(headers)) as ApiError).message,
      ),
    );

    expect(new Set(messages).size).toBe(1);
  });
});
