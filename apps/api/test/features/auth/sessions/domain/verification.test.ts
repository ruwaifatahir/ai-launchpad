import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSiweMessage } from "viem/siwe";

vi.mock("@/lib/chain/client", () => ({
  publicClient: { verifySiweMessage: vi.fn() },
}));
vi.mock("@/features/auth/sessions/sessions.storage", () => ({ takeNonce: vi.fn() }));

import { ApiError } from "@/shared";
import { publicClient } from "@/lib/chain/client";
import { readCredential } from "@/lib/credential";
import { openSession } from "@/features/auth/sessions/domain/verification";
import { takeNonce } from "@/features/auth/sessions/sessions.storage";

const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const signature = `0x${"ab".repeat(65)}` as const;

const siwe = (overrides: Partial<Parameters<typeof createSiweMessage>[0]> = {}) =>
  createSiweMessage({
    address: wallet,
    chainId: 46630,
    domain: "localhost:5173",
    nonce: "thenonce",
    uri: "http://localhost:5173/panel",
    version: "1",
    ...overrides,
  });

const verify = (message: string) => openSession({ message, signature });

const rejection = async (message: string) => {
  try {
    await verify(message);
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected a rejection");
};

describe("openSession", () => {
  beforeEach(() => {
    vi.mocked(takeNonce).mockResolvedValue(true);
    vi.mocked(publicClient.verifySiweMessage).mockResolvedValue(true);
  });

  it("returns a credential naming the signing wallet, so every later request resolves to that address", async () => {
    const { token } = await verify(siwe());

    expect(await readCredential(token)).toBe(wallet);
  });

  it("returns the credential alone, because the panel already holds the address it signed with", async () => {
    expect(Object.keys(await verify(siwe()))).toEqual(["token"]);
  });

  it("rejects a message that is not EIP-4361 at all, so a caller cannot smuggle a bare string past the checks", async () => {
    await expect(verify("give me a session")).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a domain outside PANEL_ORIGINS, which is what stops another site reusing a signature it harvested", async () => {
    await expect(verify(siwe({ domain: "evil.example" }))).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("rejects a chain id other than the configured chain, so a message meant for another chain is a clean 401", async () => {
    await expect(verify(siwe({ chainId: 1 }))).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a message whose expiration has passed, because an old signature is dead", async () => {
    const expired = siwe({ expirationTime: new Date(Date.now() - 1000) });

    await expect(verify(expired)).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a nonce the backend did not issue or has already spent, which is what defeats a replay", async () => {
    vi.mocked(takeNonce).mockResolvedValue(false);

    await expect(verify(siwe())).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a signature the wallet did not produce, which is the check the whole flow rests on", async () => {
    vi.mocked(publicClient.verifySiweMessage).mockResolvedValue(false);

    await expect(verify(siwe())).rejects.toBeInstanceOf(ApiError);
  });

  it("spends the nonce before checking the signature, so a caller cannot grind signatures against one nonce", async () => {
    vi.mocked(publicClient.verifySiweMessage).mockResolvedValue(false);

    await expect(verify(siwe())).rejects.toBeInstanceOf(ApiError);
    expect(takeNonce).toHaveBeenCalledWith("thenonce");
  });

  it("never reaches the chain once a cheap check has failed, so a bad message costs no RPC call", async () => {
    await expect(verify(siwe({ chainId: 1 }))).rejects.toBeInstanceOf(ApiError);

    expect(publicClient.verifySiweMessage).not.toHaveBeenCalled();
    expect(takeNonce).not.toHaveBeenCalled();
  });

  it("answers every rejection with one status and one message, so a caller cannot tell which check failed", async () => {
    const badMessage = await rejection("give me a session");
    const badDomain = await rejection(siwe({ domain: "evil.example" }));
    const badChain = await rejection(siwe({ chainId: 1 }));
    const expired = await rejection(
      siwe({ expirationTime: new Date(Date.now() - 1000) }),
    );

    vi.mocked(takeNonce).mockResolvedValue(false);
    const spentNonce = await rejection(siwe());

    vi.mocked(takeNonce).mockResolvedValue(true);
    vi.mocked(publicClient.verifySiweMessage).mockResolvedValue(false);
    const badSignature = await rejection(siwe());

    const shapes = [
      badMessage,
      badDomain,
      badChain,
      expired,
      spentNonce,
      badSignature,
    ].map((error) => `${error.statusCode}:${error.message}`);

    expect(shapes[0]).toBe("401:Could not verify that signed message.");
    expect(new Set(shapes).size).toBe(1);
  });
});
