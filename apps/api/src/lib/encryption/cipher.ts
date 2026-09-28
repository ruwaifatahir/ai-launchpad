import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/config/env";

// Every X credential AI Launchpad stores passes through here. The threat is a leaked
// dump or a stray database session, and the refresh credential is the whole
// connection: whoever holds one publishes as the creator until the creator
// revokes it.
//
// AES-256-GCM through Node's own crypto. The initialisation vector, the
// authentication tag and the ciphertext are one base64 value in one column,
// because they are one artefact and no one of them is any use without the other
// two. The vector is fresh per call, which is what GCM requires: reuse one and
// both plaintexts sealed under it are readable.
//
// The tag length is stated on the way back in rather than read off the stored
// value. GCM will authenticate against a shortened tag and pass, so a value whose
// tag was cut down would otherwise be checked against fewer bits than sealed it.
//
// Rotating ENCRYPTION_KEY disconnects every agent. Nothing sealed under the old
// key opens under the new one, so every creator has to connect X again. This is
// the same bargain as rotating JWT_SECRET, which signs every creator out, and it
// is rotated on the same terms.
//
// A value that will not open throws rather than answering null. A session
// credential refuses with a null because a bad one is a caller sending a bad
// string, which is routine. A sealed credential was written by this backend, so
// one that fails has been altered or the key has moved under it, and neither has
// a sensible fallback.
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const encrypt = (plaintext: string) => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, env.ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
};

export const decrypt = (sealed: string) => {
  const value = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv(
    ALGORITHM,
    env.ENCRYPTION_KEY,
    value.subarray(0, IV_BYTES),
    { authTagLength: TAG_BYTES },
  );

  decipher.setAuthTag(value.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));

  return Buffer.concat([
    decipher.update(value.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString("utf8");
};
