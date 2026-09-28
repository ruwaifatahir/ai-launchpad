import { ipKey, makeLimiter } from "@/middleware/rate-limiter";

// The logo route's own budget, keyed by the session wallet. A creator trying a few
// crops before a launch needs a handful, and every upload is a file stored and kept,
// so an hour's window rather than a minute's is what caps a wallet filling the store.
export const logoLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  prefix: "rl:logos:",
});

// The same route's budget per IP. A wallet costs nothing to make, so the wallet's
// budget alone caps nobody who signs in with many. Thirty an hour still leaves three
// creators behind one office address their full ten each.
export const logoIpLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  prefix: "rl:logos-ip:",
  key: ipKey,
});
