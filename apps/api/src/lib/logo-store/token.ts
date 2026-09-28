import { z } from "zod";

// The UploadThing token, validated here so a wrong one stops the app at boot like
// every other configuration value, rather than at the first creator who uploads a
// logo. The token is base64 JSON naming the app, and the app id is what every logo
// address is built from, so a token that does not decode to one is refused.
//
// The app id becomes a host name, so it is held to the letters and digits
// UploadThing issues. A token carrying anything else could point a logo address,
// which is written on chain for good, at a host that is not UploadThing's.
//
// This sits apart from the store for the reason src/lib/encryption/key.ts does:
// env.ts is mocked in every test, so a check written inline there is a check no
// test can fail for.
const APP_ID = /^[a-z0-9]+$/i;

const appIdOf = (token: string) => {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const appId = (decoded as { appId?: unknown } | null)?.appId;

    return typeof appId === "string" && APP_ID.test(appId) ? appId : null;
  } catch {
    return null;
  }
};

// The format is not checked on its own: whether UploadThing pads its base64 is theirs
// to change, and a token that decodes to an app id is a token that works.
export const uploadthingToken = z
  .string()
  .min(1)
  .transform((token, ctx) => {
    const appId = appIdOf(token);

    if (appId === null) {
      ctx.addIssue({ code: "custom", message: "supply a token that names an app id" });
      return z.NEVER;
    }

    return { token, appId };
  });

export type UploadthingToken = z.infer<typeof uploadthingToken>;
