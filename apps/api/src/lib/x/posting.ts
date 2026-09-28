import { z } from "zod";
import { send } from "@/lib/x/transport";

// The one call that publishes, kept apart from the OAuth calls because the same
// statuses do not mean the same thing here. A 401 at the token endpoint is
// AI Launchpad's own credentials being wrong. A 401 here is one creator's access
// credential dying, which is theirs to reconnect and never a reason to touch
// anyone else. The path still says tweets because X never renamed the endpoint
// it renamed the product on.
const POST_URL = "https://api.x.com/2/tweets";

// What can go wrong publishing, named here rather than guessed at by each caller.
// None of them carries a status or a sentence for a caller to read, and none of
// them decides what happens to the Connection: that is the caller's call, and the
// three are separate because the answers differ. A dead credential is waited on, a
// refusal is never retried, and a limit is not pushed against.

export class XCredentialDeadError extends Error {
  constructor(cause: unknown) {
    super("X no longer accepts this creator's access credential.", { cause });
    this.name = "XCredentialDeadError";
  }
}

export class XPostRefusedError extends Error {
  constructor(cause: unknown) {
    super("X refused to publish this post.", { cause });
    this.name = "XPostRefusedError";
  }
}

export class XRateLimitedError extends Error {
  constructor(cause: unknown) {
    super("X is not accepting any more posts right now.", { cause });
    this.name = "XRateLimitedError";
  }
}

// Every status this endpoint can answer with that AI Launchpad has a name for. Anything
// else is left alone and reaches the caller as it arrived, so nothing X has never
// been seen to answer is dressed up as a credential worth giving up on.
const nameFailure = (status: number, cause: string): never => {
  if (status === 401) throw new XCredentialDeadError(cause);
  if (status === 403) throw new XPostRefusedError(cause);
  if (status === 429) throw new XRateLimitedError(cause);

  throw new Error(cause);
};

// X answers with the text it stored beside the identifier. Only the identifier is
// read: what AI Launchpad sent is what AI Launchpad already holds, and a second copy of it
// would be the one that drifts.
const postResponse = z.object({ data: z.object({ id: z.string() }) });

// The creator's own credential, because X accepts no app only credential at this
// endpoint at all.
export const createPost = async ({
  accessCredential,
  text,
}: {
  accessCredential: string;
  text: string;
}) => {
  const post = postResponse.parse(
    JSON.parse(
      await send(
        POST_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessCredential}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
        },
        nameFailure,
      ),
    ),
  );

  return post.data.id;
};
