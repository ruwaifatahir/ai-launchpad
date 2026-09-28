import { UTApi, UTFile } from "uploadthing/server";
import { env } from "@/config/env";

// The one way a logo leaves AI Launchpad for storage. Nothing else in src/ knows logos are
// on UploadThing, so moving them to R2 behind a domain of ours is this file and no
// other. Logos already launched keep the address they were given, because it is on
// chain.

// Carries no status and no sentence for a caller to read: src/shared is where a
// failure becomes a response. Every failure here is the store's, never the caller's,
// because the file was already checked and encoded before it arrived.
export class LogoStoreUnreachableError extends Error {
  constructor(cause: unknown) {
    super("The logo store could not be reached.", { cause });
    this.name = "LogoStoreUnreachableError";
  }
}

// How long the check for an already stored file may take.
const TIMEOUT_MS = 10_000;

// How long an upload may take. A stored logo is a WebP of at most 512 pixels a side,
// well under a megabyte, so this is far past a healthy upload and short enough that
// a stalled store answers the creator with a 503 rather than an endless wait.
const UPLOAD_TIMEOUT_MS = 15_000;

// Built on first use rather than at import, so a test that never stores a logo never
// builds a client.
let api: UTApi | undefined;

const client = () =>
  (api ??= new UTApi({ token: env.UPLOADTHING_TOKEN.token, logLevel: "Error" }));

// A file uploaded with a custom id is served from the app's own host under that id,
// and the app id was read from the token at boot. The address therefore follows from
// the hash alone, never from what one upload happened to answer.
const addressOf = (id: string) => `https://${env.UPLOADTHING_TOKEN.appId}.ufs.sh/f/${id}`;

const isServed = (url: string) =>
  fetch(url, { method: "HEAD", signal: AbortSignal.timeout(TIMEOUT_MS) }).then(
    (response) => response.ok,
    () => false,
  );

// Stores a WebP under its hash and returns the address it is served from. A custom
// id is unique within the app, so a second upload of the same hash is refused: when
// two requests race, or a stored file lost its record. Either way the file is there,
// and a refusal behind which the address answers is the success it looks like.
export const storeLogo = async (hash: string, bytes: Buffer) => {
  const id = `${hash}.webp`;
  const url = addressOf(id);
  const file = new UTFile([new Uint8Array(bytes)], id, {
    type: "image/webp",
    customId: id,
  });

  const failure = await client()
    .uploadFiles(file, { signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) })
    .then(
      (result) => result.error,
      (cause: unknown) => cause,
    );

  if (failure && !(await isServed(url))) throw new LogoStoreUnreachableError(failure);

  return url;
};
