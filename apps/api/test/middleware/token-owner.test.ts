import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("@/lib/chain/client", () => ({ readTokenCreator: vi.fn() }));

import { type ApiError } from "@/shared";
import { readTokenCreator } from "@/lib/chain/client";
import { tokenOwner } from "@/middleware/token-owner";

const creator = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const stranger = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";

const run = (wallet: string, address: string = token) =>
  new Promise<unknown>((resolve) => {
    const req = {
      params: { token: address },
      session: { wallet },
    } as unknown as Request;

    tokenOwner("token")(
      req,
      {} as Response,
      ((error?: unknown) => resolve(error)) as NextFunction,
    );
  });

const status = (error: unknown) => (error as ApiError).statusCode;

describe("tokenOwner", () => {
  beforeEach(() => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator);
  });

  it("lets the request through when the session wallet is the creator the chain reports", async () => {
    await expect(run(creator)).resolves.toBeUndefined();
  });

  it("compares addresses case insensitively, so a lowercase creator on chain still matches a checksummed session", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(creator.toLowerCase() as `0x${string}`);

    await expect(run(creator)).resolves.toBeUndefined();
  });

  it("answers 403 when the session wallet is not the creator, because naming a wallet grants nothing", async () => {
    expect(status(await run(stranger))).toBe(403);
  });

  it("answers 404 when the chain holds no creator for the address, which is a token that does not exist", async () => {
    vi.mocked(readTokenCreator).mockResolvedValue(null);

    expect(status(await run(creator))).toBe(404);
  });

  it("forwards whatever the chain failed with, never deciding here what an unreadable chain means", async () => {
    const failure = new Error("named by the chain client");

    vi.mocked(readTokenCreator).mockRejectedValue(failure);

    await expect(run(creator)).resolves.toBe(failure);
  });

  it("answers 400 for a path parameter that is not an address, before any chain read is attempted", async () => {
    expect(status(await run(creator, "not-an-address"))).toBe(400);
    expect(readTokenCreator).not.toHaveBeenCalled();
  });

  it("answers 400 for a mistyped address rather than asking the chain about a token nobody launched", async () => {
    const mistyped = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251f";

    expect(status(await run(creator, mistyped))).toBe(400);
    expect(readTokenCreator).not.toHaveBeenCalled();
  });

  it("reads the chain for the address in the path parameter it was given, never a fixed one", async () => {
    await run(creator);

    expect(readTokenCreator).toHaveBeenCalledWith(token);
  });
});
