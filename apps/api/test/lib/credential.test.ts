import { describe, expect, it } from "vitest";
import { jwtVerify } from "jose";

import { mintCredential, readCredential } from "@/lib/credential";
import { TEST_ENV } from "@test/helpers/env.mock";
import { forgeCredential } from "@test/helpers/credential";

const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const secret = new TextEncoder().encode(TEST_ENV.JWT_SECRET as string);

describe("credential", () => {
  it("reads back the wallet it minted for, which no test could assert while minting and reading were separate modules free to disagree", async () => {
    expect(await readCredential(await mintCredential(wallet))).toBe(wallet);
  });

  it("checksums the wallet it is handed, so the same wallet in either casing mints the same subject", async () => {
    expect(await readCredential(await mintCredential(wallet.toLowerCase()))).toBe(wallet);
  });

  it("dates the credential seven days out, which is the only thing that ends a session", async () => {
    const { payload } = await jwtVerify(await mintCredential(wallet), secret);

    expect(payload.exp! - payload.iat!).toBe(7 * 24 * 60 * 60);
  });

  it("puts nothing but the wallet, the issuer, the audience and the two timestamps in the credential", async () => {
    const { payload } = await jwtVerify(await mintCredential(wallet), secret);

    expect(Object.keys(payload).sort()).toEqual(["aud", "exp", "iat", "iss", "sub"]);
  });

  it("refuses a credential signed with a stronger HMAC than the one this backend issues, so the algorithm is pinned not inferred", async () => {
    const credential = await forgeCredential(wallet, { algorithm: "HS512" });

    expect(await readCredential(credential)).toBeNull();
  });

  it("refuses a credential signed with another secret, so a forged one from elsewhere is worthless here", async () => {
    const credential = await forgeCredential(wallet, {
      signWith: new TextEncoder().encode("another-secret-at-least-32-characters"),
    });

    expect(await readCredential(credential)).toBeNull();
  });

  it("refuses a credential whose expiry has passed, which is the only thing that ends a session", async () => {
    const credential = await forgeCredential(wallet, { expiresIn: "-1s" });

    expect(await readCredential(credential)).toBeNull();
  });

  it("refuses a credential whose subject is not a wallet address, so no caller is handed a bare string typed as one", async () => {
    expect(await readCredential(await forgeCredential("someone"))).toBeNull();
  });

  it("answers null rather than throwing for a string that is not a credential at all, because the caller decides what a refusal looks like", async () => {
    expect(await readCredential("not.a.credential")).toBeNull();
  });

  it("refuses a credential with no issuer or another one, so a token another service signed with a shared secret is never read as ours", async () => {
    expect(
      await readCredential(await forgeCredential(wallet, { issuer: null })),
    ).toBeNull();
    expect(
      await readCredential(await forgeCredential(wallet, { issuer: "someone-else" })),
    ).toBeNull();
  });

  it("refuses a credential with no audience or another one, so a token minted for another client is never accepted here", async () => {
    expect(
      await readCredential(await forgeCredential(wallet, { audience: null })),
    ).toBeNull();
    expect(
      await readCredential(await forgeCredential(wallet, { audience: "another-client" })),
    ).toBeNull();
  });
});
