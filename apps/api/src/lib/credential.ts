import { SignJWT, jwtVerify } from "jose";
import { getAddress } from "viem";
import type { Address } from "viem";
import { env } from "@/config/env";

// The Credential, minted and read in one place. Four facts describe it: the
// algorithm, the lifetime, the subject and the secret. They were written out in
// five modules before this one, and nothing made the half that mints agree with
// the half that reads.
//
// A refusal is null, never a status. Nothing here knows about HTTP: the
// Authorization header, the bearer scheme and the 401 all belong to
// src/middleware/session.ts, and one refusal value is what lets that file answer
// every failure the same way.
//
// The issuer and audience are pinned and required on the way back in (RFC 8725), so
// a token some other service signed with a shared secret is never read as ours.
const ALGORITHM = "HS256";
const LIFETIME = "7d";
export const CREDENTIAL_ISSUER = "ai-launchpad-api";
export const CREDENTIAL_AUDIENCE = "ai-launchpad-web";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export const mintCredential = (wallet: string): Promise<string> =>
  new SignJWT()
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .setSubject(getAddress(wallet))
    .setIssuer(CREDENTIAL_ISSUER)
    .setAudience(CREDENTIAL_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(LIFETIME)
    .sign(secret);

export const readCredential = async (credential: string): Promise<Address | null> => {
  try {
    const { payload } = await jwtVerify(credential, secret, {
      algorithms: [ALGORITHM],
      issuer: CREDENTIAL_ISSUER,
      audience: CREDENTIAL_AUDIENCE,
      requiredClaims: ["sub", "iat", "exp"],
    });

    return getAddress(payload.sub ?? "");
  } catch {
    return null;
  }
};
