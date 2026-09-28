import { cached } from "@/lib/redis/cache";

// Every market response is held for five seconds. The Panel polls every few seconds
// and the indexer already runs a few seconds behind the chain, so a visitor sees
// nothing older than they would anyway, and many visitors watching one token cost the
// indexer one read every five seconds rather than one each.
const TTL_SECONDS = 5;

// Bumped whenever a market response changes shape, so a deploy never serves an entry
// the previous build wrote in the old one.
const KEY_VERSION = "v2";

// The same five seconds, told to the browser and anything shared between it and us.
// A poll inside the window is answered without reaching the backend at all. Only a
// success carries it: an error never passes through the controller that sets it.
export const MARKET_CACHE_CONTROL = `public, max-age=${TTL_SECONDS}`;

type MarketRoute = "trades" | "chart" | "holders";

// Keyed by route, token and the one query that varies the answer: the page, or the
// chart's range. The token must be the lowercased address, so a checksummed and a
// lowercase request share one entry.
export const cachedMarketRead = <T>(
  route: MarketRoute,
  token: string,
  variant: string | number,
  load: () => Promise<T>,
): Promise<T> =>
  cached(`market:${KEY_VERSION}:${route}:${token}:${variant}`, TTL_SECONDS, load);

type MarketList = "graduated" | "explore" | "search" | "creator" | "quote-assets";

// A list names no token, so it is keyed by route and every query value, in the order
// the caller gives them. Each value is URI encoded, so free text cannot run into the
// next value and make two requests share one entry. A list taking no query is keyed
// by its route alone.
export const cachedMarketList = <T>(
  route: MarketList,
  query: Record<string, string | number>,
  load: () => Promise<T>,
): Promise<T> => {
  const variant = Object.entries(query)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("&");
  const key = `market:${KEY_VERSION}:${route}`;

  return cached(variant ? `${key}:${variant}` : key, TTL_SECONDS, load);
};

// The analytics figures stop at the end of the last full UTC day, so one answer serves
// every visitor for as long as the value says, at most until the next midnight. Keyed
// by that day too, so an entry never outlives the day it counts to.
export const cachedAnalytics = <T>(
  lastFullDay: number,
  ttlSeconds: (value: T) => number,
  load: () => Promise<T>,
): Promise<T> =>
  cached(`market:${KEY_VERSION}:analytics:${lastFullDay}`, ttlSeconds, load);
