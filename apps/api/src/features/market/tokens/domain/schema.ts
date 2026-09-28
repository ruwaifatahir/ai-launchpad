import { z } from "zod";
import { anyCaseAddress, pageQuery, pageSizeQuery } from "@/features/market/request";

export const graduatedRequestSchema = z.object({
  query: z.object({ page: pageQuery, pageSize: pageSizeQuery(10) }),
});

export type GraduatedRequest = z.infer<typeof graduatedRequestSchema>;

export const EXPLORE_SORTS = [
  "recent-buys",
  "newest",
  "oldest",
  "market-cap",
  "volume",
] as const;

// How far back a list reaches. all reaches every token. What falls inside the window
// depends on the sort: the last buy under recent-buys, the hours traded under volume,
// the launch under the rest.
export const LIST_AGES = ["all", "24h", "7d"] as const;

export const exploreRequestSchema = z.object({
  query: z.object({
    sort: z.enum(EXPLORE_SORTS).default("recent-buys"),
    age: z.enum(LIST_AGES).default("all"),
    page: pageQuery,
    pageSize: pageSizeQuery(50),
  }),
});

export type ExploreRequest = z.infer<typeof exploreRequestSchema>;
export type ExploreSort = (typeof EXPLORE_SORTS)[number];
export type ListAge = (typeof LIST_AGES)[number];

export const SEARCH_SORTS = [
  "relevance",
  "market-cap",
  "volume",
  "newest",
  "oldest",
] as const;

export const MAX_SEARCH_LENGTH = 64;

// Search text, trimmed. Empty browses every token. It is lowercased here, because the
// match ignores case, so the cache key and the query read one form. A control
// character is refused: Postgres cannot hold a NUL in text, and no name holds a tab.
const searchText = z
  .string()
  .trim()
  .max(MAX_SEARCH_LENGTH, `at most ${MAX_SEARCH_LENGTH} characters`)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\u0000-\u001f\u007f]*$/, "no control characters")
  .default("")
  .transform((text) => text.toLowerCase());

// The Panel sends back a quote asset address this backend served in lowercase.
const quoteAddress = anyCaseAddress("a quote asset address").optional();

export const searchRequestSchema = z.object({
  query: z.object({
    q: searchText,
    sort: z.enum(SEARCH_SORTS).default("relevance"),
    age: z.enum(LIST_AGES).default("all"),
    quote: quoteAddress,
    page: pageQuery,
    pageSize: pageSizeQuery(24),
  }),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const creatorRequestSchema = z.object({
  params: z.object({ creator: anyCaseAddress("a wallet address") }),
  query: z.object({ page: pageQuery, pageSize: pageSizeQuery(24) }),
});

export type CreatorRequest = z.infer<typeof creatorRequestSchema>;
