import { z } from "zod";

// The key the credential cipher runs on, validated here so a wrong one stops the
// app at boot like every other configuration value, rather than at the first
// credential it tries to store. AES-256 takes a key of exactly thirty two bytes
// and will take no other length, so the check counts decoded bytes and never the
// characters someone typed. A passphrase of thirty two characters is not a key.
//
// The format is checked before the decode because Buffer.from drops any character
// it does not recognise as base64. A key with a stray character in it would
// otherwise decode to the right length, boot the app, and surface as every stored
// credential failing to open.
//
// This sits apart from the cipher so src/config/env.ts can read it with no edge
// back into the cipher, which reads src/config/env.ts in turn. The other reason
// is that the rules above are then provable: env.ts is mocked in every test, so a
// check written inline there is a check no test can fail for.
const KEY_BYTES = 32;

export const encryptionKey = z
  .base64("supply the key as base64")
  .transform((value) => Buffer.from(value, "base64"))
  .refine((key) => key.length === KEY_BYTES, "supply a base64 key of exactly 32 bytes");
