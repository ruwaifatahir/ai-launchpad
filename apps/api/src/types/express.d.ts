// What this project's middleware attaches to the request.
//
// `session` is set by src/middleware/session.ts, which rejects the request when it
// cannot verify the credential. It is declared as always present because every
// handler that reads it is mounted after that middleware, which is what lets a
// handler read a wallet address with no cast and no guard. Reading it in a route
// that does not run the session middleware is the mistake this note warns about.
declare namespace Express {
  interface Request {
    session: { wallet: `0x${string}` };
  }
}
