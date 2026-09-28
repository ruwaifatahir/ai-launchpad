// The one way out of AI Launchpad to X. Every call in this folder goes through send, so
// the deadline is set once and an outage has one shape wherever it is caught.
//
// Only the failure that means the same thing on every X endpoint is named here.
// Every other status goes back to the module that made the call, because 400 at
// the token endpoint and 401 at the post endpoint do not mean the same thing, and
// one mapping serving both is the bug this module exists to prevent.

// X answers or it does not. Without a deadline a hung connection holds a request
// open until the caller gives up, and the unreachable branch below would never be
// reached.
const TIMEOUT_MS = 10_000;

// Truncated because an outage is answered by whatever sits in front of X rather
// than by X, and that can be a page of HTML. The first line of it is enough to
// tell an operator who answered.
const answer = (url: string, status: number, body: string) =>
  `${url} answered ${status}: ${body.slice(0, 200)}`;

// Carries no status and no sentence for a caller to read: nothing in this folder
// knows about HTTP, and src/shared/middleware/error-handler.ts is where a failure
// becomes a response.
//
// A dependency that is down is worth waiting out. Separating that from a value
// that is wrong is what stops an operator being sent to restart something that was
// never broken.
export class XUnreachableError extends Error {
  constructor(cause: unknown) {
    super("X could not be reached.", { cause });
    this.name = "XUnreachableError";
  }
}

// fetch rejects for a refused connection, a DNS failure and the deadline above
// alike. All three mean X did not answer, and a 5xx is the same outage arriving
// with a status attached.
export const send = async (
  url: string,
  init: RequestInit,
  nameFailure: (status: number, cause: string) => never,
) => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((cause: unknown) => {
    throw new XUnreachableError(cause);
  });

  const body = await response.text().catch(() => "");

  if (!response.ok) {
    const cause = answer(url, response.status, body);

    if (response.status >= 500) throw new XUnreachableError(cause);

    nameFailure(response.status, cause);
  }

  return body;
};
