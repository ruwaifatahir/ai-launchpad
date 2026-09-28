import { describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";

import { ApiError } from "@/shared";
import { redis } from "@/lib/redis/client";
import { mintCredential } from "@/lib/credential";
import { session } from "@/middleware/session";
import { forgeCredential } from "@test/helpers/credential";

const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";

const run = (headers: Record<string, string>) =>
  new Promise<{ req: Request; error: unknown }>((resolve) => {
    const req = { headers } as unknown as Request;
    const next = ((error?: unknown) => resolve({ req, error })) as NextFunction;
    session(req, {} as Response, next);
  });

const bearer = (token: string) => run({ authorization: `Bearer ${token}` });

describe("session", () => {
  it("puts the wallet named by the credential on the request, which is what every later handler reads", async () => {
    const { req, error } = await bearer(await mintCredential(wallet));

    expect(error).toBeUndefined();
    expect(req.session.wallet).toBe(wallet);
  });

  it("checksums the wallet, so a credential holding a lowercase address still resolves to one canonical form", async () => {
    const { req } = await bearer(await forgeCredential(wallet.toLowerCase()));

    expect(req.session.wallet).toBe(wallet);
  });

  it("reads no store to resolve the credential, which is what lets a protected request carry no lookup", async () => {
    await bearer(await mintCredential(wallet));

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.getdel).not.toHaveBeenCalled();
    expect(redis.call).not.toHaveBeenCalled();
  });

  it("rejects a request with no Authorization header", async () => {
    const { error } = await run({});

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(401);
  });

  it("rejects a credential sent outside the bearer scheme, because the backend reads it from nowhere else", async () => {
    const { error } = await run({ authorization: await mintCredential(wallet) });

    expect(error).toBeInstanceOf(ApiError);
  });

  it("rejects a credential behind another scheme of the same length as Bearer, so the scheme is read rather than counted off", async () => {
    const { error } = await run({
      authorization: `Token  ${await mintCredential(wallet)}`,
    });

    expect(error).toBeInstanceOf(ApiError);
  });

  it("rejects a credential signed with a stronger HMAC than the one this backend issues, so the algorithm is pinned not inferred", async () => {
    const token = await forgeCredential(wallet, { algorithm: "HS512" });

    const { error } = await bearer(token);

    expect(error).toBeInstanceOf(ApiError);
  });

  it("rejects a credential altered after it was issued, which is the whole point of signing it", async () => {
    const token = await mintCredential(wallet);
    const [header, payload, signature] = token.split(".");
    const tampered = `${header}.${Buffer.from(
      JSON.stringify({ sub: "0x0000000000000000000000000000000000000001" }),
    ).toString("base64url")}.${signature}`;

    const { error } = await bearer(tampered);

    expect(error).toBeInstanceOf(ApiError);
    expect(payload).not.toBe(tampered.split(".")[1]);
  });

  it("rejects a credential signed with another secret, so a forged one from elsewhere is worthless here", async () => {
    const token = await forgeCredential(wallet, {
      signWith: new TextEncoder().encode("another-secret-at-least-32-characters"),
    });

    const { error } = await bearer(token);

    expect(error).toBeInstanceOf(ApiError);
  });

  it("rejects a credential whose expiry has passed, which is the only thing that ends a session", async () => {
    const token = await forgeCredential(wallet, { expiresIn: "-1s" });

    const { error } = await bearer(token);

    expect(error).toBeInstanceOf(ApiError);
  });

  it("rejects an unsigned credential claiming alg none, so the signature can never be opted out of", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: wallet, exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString("base64url");

    const { error } = await bearer(`${header}.${payload}.`);

    expect(error).toBeInstanceOf(ApiError);
  });

  it("rejects a credential whose subject is not a wallet address, so req.session.wallet is never a bare string", async () => {
    const { error } = await bearer(await forgeCredential("someone"));

    expect(error).toBeInstanceOf(ApiError);
  });

  it("answers every rejection with one status and one message, so a caller cannot tell which check failed", async () => {
    const results = await Promise.all([
      run({}),
      run({ authorization: "Basic abc" }),
      bearer("not.a.token"),
      bearer(await forgeCredential(wallet, { expiresIn: "-1s" })),
      bearer(await forgeCredential("someone")),
    ]);

    const shapes = results.map(
      ({ error }) => `${(error as ApiError).statusCode}:${(error as ApiError).message}`,
    );

    expect(shapes[0]).toBe("401:Sign in with your wallet to do that.");
    expect(new Set(shapes).size).toBe(1);
  });

  it("reads the scheme name in any case, as RFC 9110 defines it", async () => {
    const { req, error } = await run({
      authorization: `bearer ${await mintCredential(wallet)}`,
    });

    expect(error).toBeUndefined();
    expect(req.session.wallet).toBe(wallet);
  });

  it("refuses a header longer than any credential this backend mints before parsing it", async () => {
    const { error } = await bearer(`${"a".repeat(3000)}.b.c`);

    expect(error).toBeInstanceOf(ApiError);
  });
});
