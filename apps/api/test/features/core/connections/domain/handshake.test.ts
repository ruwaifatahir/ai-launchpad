import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/connections/data-model/connections.storage", () => ({
  storeHandshake: vi.fn(),
  takeHandshake: vi.fn(),
}));
vi.mock("@/features/core/connections/domain/consent", () => ({
  requireCurrentConsent: vi.fn(),
}));
vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));
vi.mock("@/lib/x/oauth", () => ({ authorizeUrl: vi.fn() }));

import { ApiError } from "@/shared";
import { readTokenGraduation } from "@/features/core/graduations/reading";
import { logger } from "@/lib/logger";
import { authorizeUrl } from "@/lib/x/oauth";
import { storeHandshake } from "@/features/core/connections/data-model/connections.storage";
import { requireCurrentConsent } from "@/features/core/connections/domain/consent";
import { startHandshake } from "@/features/core/connections/domain/handshake";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;
const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e" as const;
const graduatedAt = new Date("2026-03-01T12:00:00.000Z");
const url = "https://x.com/i/oauth2/authorize?response_type=code";

const storedState = () => vi.mocked(storeHandshake).mock.calls[0][0];

const storedHandshake = () => vi.mocked(storeHandshake).mock.calls[0][1];

describe("startHandshake", () => {
  beforeEach(() => {
    vi.mocked(readTokenGraduation).mockResolvedValue(graduatedAt);
    vi.mocked(requireCurrentConsent).mockResolvedValue(undefined);
    vi.mocked(authorizeUrl).mockReturnValue(url);
  });

  it("answers with the URL the panel navigates to and nothing else, because a browser navigation carries no credential and an authenticated route cannot redirect", async () => {
    const started = await startHandshake({ token }, wallet);

    expect(Object.keys(started)).toEqual(["url"]);
    expect(started.url).toBe(url);
  });

  it("stores the verifier, the token and the wallet against the state it sends to X, because all four have to survive the gap and the callback carries only the state", async () => {
    await startHandshake({ token }, wallet);

    const { state, verifier } = vi.mocked(authorizeUrl).mock.calls[0][0];

    expect(storedState()).toBe(state);
    expect(storedHandshake()).toEqual({ verifier, token, wallet });
  });

  it("stores the handshake before it answers, so a callback can never arrive for a state AI Launchpad did not record", async () => {
    await startHandshake({ token }, wallet);

    expect(storeHandshake).toHaveBeenCalledTimes(1);
    expect(vi.mocked(storeHandshake).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(authorizeUrl).mock.invocationCallOrder[0],
    );
  });

  it("mints a fresh state and a fresh verifier for every attempt, so one attempt's secrets never finish another's", async () => {
    await startHandshake({ token }, wallet);
    await startHandshake({ token }, wallet);

    const [first, second] = vi.mocked(storeHandshake).mock.calls;

    expect(first[0]).not.toBe(second[0]);
    expect(first[1].verifier).not.toBe(second[1].verifier);
  });

  it("never mints one secret and uses it twice, because the state travels to X in a URL a browser carries back while the verifier never leaves AI Launchpad", async () => {
    await startHandshake({ token }, wallet);

    expect(storedHandshake().verifier).not.toBe(storedState());
  });

  it("refuses a token that has not graduated, which is what connecting an X account waits for", async () => {
    vi.mocked(readTokenGraduation).mockResolvedValue(null);

    await expect(startHandshake({ token }, wallet)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("checks graduation before the consent gate, so an ungraduated creator is told to wait rather than told to agree to something they cannot use", async () => {
    vi.mocked(readTokenGraduation).mockResolvedValue(null);

    await expect(startHandshake({ token }, wallet)).rejects.toThrow();
    expect(requireCurrentConsent).not.toHaveBeenCalled();
  });

  it("lets an unreadable graduation through as a failure rather than a refusal, so a dead indexer never starts a handshake for an ungraduated token", async () => {
    vi.mocked(readTokenGraduation).mockRejectedValue(new Error("fetch failed"));

    await expect(startHandshake({ token }, wallet)).rejects.toThrow("fetch failed");
    expect(storeHandshake).not.toHaveBeenCalled();
    expect(authorizeUrl).not.toHaveBeenCalled();
  });

  it("asks X for nothing when the consent gate refuses, because X says authorizing through OAuth is not by itself consent to act and gate 1 therefore precedes gate 2", async () => {
    vi.mocked(requireCurrentConsent).mockRejectedValue(
      ApiError.conflict("Agree to the list of automated actions."),
    );

    await expect(startHandshake({ token }, wallet)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(authorizeUrl).not.toHaveBeenCalled();
    expect(storeHandshake).not.toHaveBeenCalled();
  });

  it("logs the token and never the state or the verifier, because either one is enough for a reader of the logs to finish somebody else's handshake", async () => {
    await startHandshake({ token }, wallet);

    const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);

    expect(logged).toContain(token);
    expect(logged).not.toContain(storedState());
    expect(logged).not.toContain(storedHandshake().verifier);
  });
});
