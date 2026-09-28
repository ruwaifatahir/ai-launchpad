import { describe, expect, it } from "vitest";

import { decrypt, encrypt } from "@/lib/encryption/cipher";

const IV_BYTES = 12;
const TAG_BYTES = 16;

const credential = "x-refresh-credential-a-creator-would-lose-their-account-over";

const sealedEarlier =
  "AAECAwQFBgcICQoLqhyNS4PUqiJ/nxnZp0CxZL/G0l0tGfHu2WmX+c6DWo9BvLtAl8IUSTd5OXGeTsyAWJ10TvXXec8NRi/vbBgc7Y73faHEcteKjpV+SA==";

const tamper = (sealed: string, index: number) => {
  const value = Buffer.from(sealed, "base64");

  value[index] ^= 1;

  return value.toString("base64");
};

const shortenTheTag = (sealed: string) =>
  Buffer.from(sealed, "base64")
    .subarray(0, IV_BYTES + 12)
    .toString("base64");

describe("cipher", () => {
  it("returns the plaintext unchanged through a round trip, which is the only thing a caller storing a credential is promised", () => {
    expect(decrypt(encrypt(credential))).toBe(credential);
  });

  it("opens a value sealed before this test was written, so a change to the algorithm or to the order of the three parts cannot pass as green while every credential already in Postgres stops opening", () => {
    expect(decrypt(sealedEarlier)).toBe(credential);
  });

  it("stores something other than the plaintext, which is the entire reason this module exists", () => {
    expect(encrypt(credential)).not.toContain(credential);
  });

  it("carries the initialisation vector, the authentication tag and the ciphertext in one value, so a caller writes one column and never three", () => {
    expect(Buffer.from(encrypt(credential), "base64")).toHaveLength(
      IV_BYTES + TAG_BYTES + Buffer.byteLength(credential),
    );
  });

  it("seals the same plaintext to a different value every time, because a reused initialisation vector is what breaks GCM outright", () => {
    expect(encrypt(credential)).not.toBe(encrypt(credential));
  });

  it("refuses a value whose ciphertext was altered rather than handing back altered plaintext", () => {
    expect(() => decrypt(tamper(encrypt(credential), IV_BYTES + TAG_BYTES))).toThrow();
  });

  it("refuses a value whose authentication tag was altered, which is the tag doing the one job it has", () => {
    expect(() => decrypt(tamper(encrypt(credential), IV_BYTES))).toThrow();
  });

  it("refuses a value whose initialisation vector was altered, so a row edited in a stray database session does not decrypt", () => {
    expect(() => decrypt(tamper(encrypt(credential), 0))).toThrow();
  });

  it("refuses a value cut down to a shorter tag and no ciphertext, which GCM otherwise authenticates against the shorter tag and opens as an empty credential", () => {
    expect(() => decrypt(shortenTheTag(encrypt("")))).toThrow();
  });

  it("refuses a value that was never sealed here at all, rather than failing later with a credential of nonsense", () => {
    expect(() => decrypt("not-a-sealed-value")).toThrow();
  });
});
