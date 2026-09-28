import { describe, expect, it } from "vitest";

import { verifySessionSchema } from "@/features/auth/sessions/domain/schema";

const signature = `0x${"ab".repeat(65)}`;
const parseBody = (body: unknown) => verifySessionSchema.safeParse({ body });

describe("verifySessionSchema", () => {
  it("accepts a message and its signature, which is the whole of what a caller may send", () => {
    const result = parseBody({ message: "example.com wants you to sign in", signature });

    expect(result.success).toBe(true);
    expect(result.data?.body.signature).toBe(signature);
  });

  it("rejects a missing message, so verification is never handed an empty string to parse", () => {
    expect(parseBody({ signature }).success).toBe(false);
  });

  it("rejects an empty message, because a signature over nothing proves nothing", () => {
    expect(parseBody({ message: "", signature }).success).toBe(false);
  });

  it("rejects a signature that is not hex, so a malformed one is a 400 rather than a 401", () => {
    expect(parseBody({ message: "hello", signature: "not-a-signature" }).success).toBe(
      false,
    );
  });

  it("rejects a signature with an odd number of hex digits, which cannot be a whole byte string", () => {
    expect(parseBody({ message: "hello", signature: "0xabc" }).success).toBe(false);
  });

  it("accepts a signature longer than 65 bytes, because a smart contract wallet signs at any length", () => {
    expect(
      parseBody({ message: "hello", signature: `0x${"ab".repeat(200)}` }).success,
    ).toBe(true);
  });

  it("rejects an unknown field rather than dropping it, so a client with the wrong contract is told", () => {
    expect(parseBody({ message: "hello", signature, address: "0x1234" }).success).toBe(
      false,
    );
  });
});
