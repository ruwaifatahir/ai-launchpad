import { SignJWT } from "jose";
import { CREDENTIAL_AUDIENCE, CREDENTIAL_ISSUER } from "@/lib/credential";
import { TEST_ENV } from "@test/helpers/env.mock";

// A credential built by hand rather than minted through src/lib/credential, so a
// test can produce one the real interface never would: signed with another
// algorithm, signed with another secret, already expired, issued by or for someone
// else, or naming a subject the mint would have checksummed or thrown on.
//
// A good credential comes from mintCredential in src/lib/credential. Reaching for
// forge instead is how a test says out loud that it wants a bad one.
//
// The algorithm, issuer and audience default to what the backend pins, because a
// test forging a bad subject needs everything else to pass. The lifetime
// deliberately does not: nothing here forges a credential to check how long a real
// one lasts, so copying the seven days would be one more copy to drift.

const secret = new TextEncoder().encode(TEST_ENV.JWT_SECRET as string);

export const forgeCredential = (
  subject: string,
  options: {
    algorithm?: string;
    expiresIn?: string;
    signWith?: Uint8Array;
    issuer?: string | null;
    audience?: string | null;
  } = {},
) => {
  const jwt = new SignJWT()
    .setProtectedHeader({ alg: options.algorithm ?? "HS256" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "1h");

  const issuer = options.issuer === undefined ? CREDENTIAL_ISSUER : options.issuer;
  const audience =
    options.audience === undefined ? CREDENTIAL_AUDIENCE : options.audience;

  if (issuer !== null) jwt.setIssuer(issuer);
  if (audience !== null) jwt.setAudience(audience);

  return jwt.sign(options.signWith ?? secret);
};
