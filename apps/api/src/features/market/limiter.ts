import { makeLimiter } from "@/middleware/rate-limiter";

// The market routes' own budget, counted apart from the creator routes' under its own
// prefix. They are public, so every caller is keyed by IP, and the Panel polls three
// of them every five seconds, 36 requests a minute for one open token page. The shared
// 100 a minute leaves room for two such tabs behind one address, which an office or a
// mobile carrier's shared IP passes at once. 300 holds eight, and each response is
// cached for five seconds, so a caller at the limit still costs the indexer little.
export const marketLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 300,
  prefix: "rl:market:",
});
