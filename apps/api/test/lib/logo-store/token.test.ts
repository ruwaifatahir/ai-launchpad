import { describe, expect, it } from "vitest";

import { uploadthingToken } from "@/lib/logo-store/token";

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64");

// The shape UploadThing issues: base64 JSON naming the key, the app and its regions.
const token = encode({ apiKey: "sk_live_x", appId: "abc123xyz", regions: ["sea1"] });

const parse = (value: unknown) => uploadthingToken.safeParse(value);

describe("uploadthingToken", () => {
  it("accepts a token that decodes to an app id", () => {
    expect(parse(token).success).toBe(true);
  });

  it("hands the caller the token and its app id, so nothing downstream decodes it again", () => {
    expect(parse(token).data).toEqual({ token, appId: "abc123xyz" });
  });

  it("accepts a token whose base64 is unpadded, because the padding is UploadThing's to choose", () => {
    expect(parse(token.replace(/=+$/, "")).success).toBe(true);
  });

  it("refuses a token that is not base64 JSON, which is what stops the app at boot rather than at the first upload", () => {
    expect(parse("not-a-token").success).toBe(false);
  });

  it("refuses a token that names no app id", () => {
    expect(parse(encode({ apiKey: "sk_live_x" })).success).toBe(false);
  });

  it("refuses an app id that is not letters and digits, because it becomes the host every logo address names", () => {
    expect(parse(encode({ appId: "evil.example.com/x" })).success).toBe(false);
  });

  it("refuses a token that decodes to JSON null", () => {
    expect(parse(encode(null)).success).toBe(false);
  });

  it("refuses a missing token, because a deploy that cannot store a logo should say so at boot", () => {
    expect(parse(undefined).success).toBe(false);
    expect(parse("").success).toBe(false);
  });
});
