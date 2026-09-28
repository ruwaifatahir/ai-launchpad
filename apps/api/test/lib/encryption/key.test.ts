import { describe, expect, it } from "vitest";

import { encryptionKey } from "@/lib/encryption/key";

const key = Buffer.alloc(32).toString("base64");

const parse = (value: unknown) => encryptionKey.safeParse(value);

describe("encryptionKey", () => {
  it("accepts a key that decodes to the thirty two bytes AES-256 takes", () => {
    expect(parse(key).success).toBe(true);
  });

  it("hands the caller the decoded bytes rather than the string it was given, so nothing downstream decodes a second time", () => {
    expect(parse(key).data).toEqual(Buffer.from(key, "base64"));
  });

  it("refuses a key that decodes short, which is what stops the app at boot rather than at the first credential it stores", () => {
    expect(parse(Buffer.alloc(31).toString("base64")).success).toBe(false);
  });

  it("refuses a key that decodes long, because a key the cipher would reject is a key the app must not boot with", () => {
    expect(parse(Buffer.alloc(33).toString("base64")).success).toBe(false);
  });

  it("counts decoded bytes and not characters, so a thirty two character passphrase pasted in by hand is refused", () => {
    expect(parse("aPassphraseOfThirtyTwoCharacters").success).toBe(false);
  });

  it("refuses a key carrying a character base64 has no meaning for, which would otherwise be dropped on the way to the right length", () => {
    expect(parse(`${key}!!!garbage`).success).toBe(false);
  });

  it("refuses a missing key, because there is no default and a default would encrypt every deployment with the same key", () => {
    expect(parse(undefined).success).toBe(false);
  });
});
