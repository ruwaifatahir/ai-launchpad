import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/sessions/sessions.storage", () => ({ storeNonce: vi.fn() }));

import { issueNonce } from "@/features/auth/sessions/domain/nonce";
import { storeNonce } from "@/features/auth/sessions/sessions.storage";

describe("issueNonce", () => {
  it("stores the nonce before returning it, so a caller can never sign one the backend will not recognise", async () => {
    let storedWhileIssuing: string | undefined;
    vi.mocked(storeNonce).mockImplementation(async (nonce: string) => {
      storedWhileIssuing = nonce;
      return "OK";
    });

    const result = await issueNonce();

    expect(storedWhileIssuing).toBe(result.nonce);
  });

  it("returns a nonce it has not issued before, which is what stops one signature being reused", async () => {
    const first = await issueNonce();
    const second = await issueNonce();

    expect(first.nonce).not.toBe(second.nonce);
  });

  it("returns the nonce alone, because a caller needs nothing else to build the message", async () => {
    const result = await issueNonce();

    expect(Object.keys(result)).toEqual(["nonce"]);
  });
});
