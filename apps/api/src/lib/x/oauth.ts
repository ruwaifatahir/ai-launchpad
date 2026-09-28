import { createHash } from "node:crypto";
import { z } from "zod";
import { env } from "@/config/env";
import { send } from "@/lib/x/transport";

// Every call AI Launchpad makes to X about a grant: the authorize URL, the code
// exchange, the renewal, the revoke and the account read. One module rather than
// five call sites, because X publishes no error shape for its token endpoint and
// the mapping below is the only place that decision is made.
const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
const ACCOUNT_URL = "https://api.x.com/2/users/me";

// The documented minimum for the two calls AI Launchpad makes plus renewal: publishing,
// reading, identifying the account, and staying connected. Reading is not
// optional. X's create post endpoint requires it, and it grants every post the
// account can see rather than only its own, so the ask is minimal and the grant
// is wider than the ask.
//
// No scope here permits a like, a follow or a quote. Those are banned by X's own
// automation rules and removed from this tier, and they are not asked for.
const SCOPES = ["tweet.write", "tweet.read", "users.read", "offline.access"];

// What can go wrong asking X about a grant, named here rather than guessed at by
// each caller. Neither carries a status or a sentence for a caller to read.
//
// X documents no error shape for its token endpoint at all, so this mapping rests
// on the OAuth 2 specification plus the one live test we have, where a spent
// refresh credential returned 400.
//
// Telling a gone grant apart from our own wrong credentials is the single line
// standing between a mistyped client secret in a deploy and every Connection in
// the database being deleted inside an hour. It is the same distinction the chain
// module draws, for the same reason.

export class XGrantGoneError extends Error {
  constructor(cause: unknown) {
    super("X no longer holds this grant.", { cause });
    this.name = "XGrantGoneError";
  }
}

export class XMisconfiguredError extends Error {
  constructor(cause: unknown) {
    super(
      "X rejected the app's own credentials. Check X_CLIENT_ID and X_CLIENT_SECRET.",
      {
        cause,
      },
    );
    this.name = "XMisconfiguredError";
  }
}

// X authenticates a confidential client on the token and revoke endpoints with
// the client identifier and secret in an Authorization header, never in the form
// body.
const clientAuth = `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString("base64")}`;

// Every status these endpoints can answer with that AI Launchpad has a name for.
// Anything else is left alone and reaches the caller as it arrived, so nothing is
// dressed up as a grant worth deleting.
const nameFailure = (status: number, cause: string): never => {
  if (status === 400) throw new XGrantGoneError(cause);
  if (status === 401) throw new XMisconfiguredError(cause);

  throw new Error(cause);
};

const form = (url: string, fields: Record<string, string>) =>
  send(
    url,
    {
      method: "POST",
      headers: {
        Authorization: clientAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields),
    },
    nameFailure,
  );

// X hands back a whole new pair on both grant types, and the lifetime as seconds
// from now. A caller stores an expiry, the same shape as every other time AI Launchpad
// holds.
const grantResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

const exchange = async (fields: Record<string, string>) => {
  const grant = grantResponse.parse(JSON.parse(await form(TOKEN_URL, fields)));

  return {
    accessCredential: grant.access_token,
    refreshCredential: grant.refresh_token,
    expiresAt: new Date(Date.now() + grant.expires_in * 1000),
  };
};

const accountResponse = z.object({
  data: z.object({ id: z.string(), username: z.string() }),
});

// The challenge is derived here rather than handed in, so the verifier a caller
// stores and the challenge X is shown cannot drift apart.
export const authorizeUrl = ({
  state,
  verifier,
}: {
  state: string;
  verifier: string;
}) => {
  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: env.X_CLIENT_ID,
    redirect_uri: env.X_CALLBACK_URL,
    scope: SCOPES.join(" "),
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });

  return `${AUTHORIZE_URL}?${parameters}`;
};

export const exchangeCode = ({ code, verifier }: { code: string; verifier: string }) =>
  exchange({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.X_CALLBACK_URL,
    code_verifier: verifier,
  });

export const renewGrant = (refreshCredential: string) =>
  exchange({ grant_type: "refresh_token", refresh_token: refreshCredential });

// The credential and nothing else, which is all X documents a confidential client
// sending here. The answer is dropped because X documents no success shape for
// this endpoint at all, so there is nothing worth checking. Only the refresh
// credential is revoked: whether that kills the access credential too is
// undocumented, and it dies by expiry either way.
export const revokeGrant = async (refreshCredential: string) => {
  await form(REVOKE_URL, { token: refreshCredential });
};

// The identifier is the account's permanent one at X. The handle is what a
// creator recognises and X lets them change it, so a caller storing one is
// storing what was true at the moment of this call.
export const readAccount = async (accessCredential: string) => {
  const account = accountResponse.parse(
    JSON.parse(
      await send(
        ACCOUNT_URL,
        { headers: { Authorization: `Bearer ${accessCredential}` } },
        nameFailure,
      ),
    ),
  );

  return { id: account.data.id, handle: account.data.username };
};
