import { describe, expect, it } from "vitest";

import {
  agreeConsentSchema,
  attestationSchema,
  callbackSchema,
  connectionParamsSchema,
} from "@/features/core/connections/domain/schema";

const token = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
const lowercased = "0xbcd4042de499d14e55001ccbb24a551f3b954096";

const agree = (body: unknown) =>
  agreeConsentSchema.safeParse({ params: { token }, body });

describe("connectionParamsSchema", () => {
  it("lowercases the token, so one token is one key whatever casing the creator copied", () => {
    const parsed = connectionParamsSchema.parse({ params: { token } });

    expect(parsed.params.token).toBe(lowercased);
  });

  it("rejects a token that is not an address, so the chain is never read for a typo", () => {
    expect(connectionParamsSchema.safeParse({ params: { token: "nope" } }).success).toBe(
      false,
    );
  });
});

describe("agreeConsentSchema", () => {
  it("requires the version agreed to, because an agreement that does not name its text is not a record of anything", () => {
    expect(agree({}).success).toBe(false);
  });

  it("accepts the version as a whole number, which is what the read hands the panel back", () => {
    const parsed = agree({ version: 1 });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.body.version).toBe(1);
  });

  it("rejects a version that is not a whole number above zero, so no agreement is recorded against a text that cannot exist", () => {
    expect(agree({ version: 0 }).success).toBe(false);
    expect(agree({ version: -1 }).success).toBe(false);
    expect(agree({ version: 1.5 }).success).toBe(false);
    expect(agree({ version: "1" }).success).toBe(false);
  });

  it("rejects an unknown field rather than dropping it, because a panel sending one has the wrong contract", () => {
    expect(agree({ version: 1, agreed: true }).success).toBe(false);
  });
});

const callback = (query: unknown) => callbackSchema.safeParse({ query });

describe("callbackSchema", () => {
  it("accepts the state and the code X sends back when the creator authorizes", () => {
    const parsed = callback({ state: "aState", code: "aCode" });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.query).toEqual({ state: "aState", code: "aCode" });
  });

  it("accepts the state and the error X sends back when the creator declines, so a creator who changed their mind lands back in the panel rather than on a failure", () => {
    const parsed = callback({ state: "aState", error: "access_denied" });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.query).toEqual({ state: "aState", error: "access_denied" });
  });

  it("rejects a callback carrying no state, because the state AI Launchpad issued is the only thing vouching for a request that carries no credential", () => {
    expect(callback({ code: "aCode" }).success).toBe(false);
    expect(callback({ state: "", code: "aCode" }).success).toBe(false);
  });

  it("rejects a callback carrying neither a code nor an error, because X sends one or the other and anything else was not sent by X", () => {
    expect(callback({ state: "aState" }).success).toBe(false);
    expect(callback({ state: "aState", code: "" }).success).toBe(false);
  });

  it("keeps no token from the query, so a token named in the request cannot reach the domain and the stored handshake stays the only source of it", () => {
    const parsed = callback({ state: "aState", code: "aCode", token });

    expect(parsed.data?.query).not.toHaveProperty("token");
  });
});

const attest = (body: unknown) =>
  attestationSchema.safeParse({ params: { token }, body });

describe("attestationSchema", () => {
  it("takes no body, because confirming the automated label and the bio link is one action and carries nothing", () => {
    const parsed = attest({});

    expect(parsed.success).toBe(true);
    expect(parsed.data?.params.token).toBe(lowercased);
  });

  it("rejects a field claiming one of the two steps separately, so a panel cannot record half a confirmation AI Launchpad would then have to interpret", () => {
    expect(attest({ automatedLabel: true }).success).toBe(false);
    expect(attest({ confirmed: true }).success).toBe(false);
  });
});
