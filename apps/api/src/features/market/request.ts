import { z } from "zod";
import { chainAddress } from "@/lib/chain/address";

// The request pieces every market route shares, so the three schemas cannot drift.

export const tokenParams = z.object({ token: chainAddress });

export const PAGE_SIZE = 10;

// A million rows deep. No token is near it, so it bounds a page only against a number
// nobody means, never against real history.
export const MAX_PAGE = 100_000;

// Digits only, from 1. Number() alone would take "1e1", "0x2" and " 3", and each would
// be a different request for one page.
export const pageQuery = z
  .string()
  .regex(/^[1-9][0-9]*$/, "a whole number from 1")
  .transform(Number)
  .pipe(z.number().max(MAX_PAGE))
  .default(1);

export const pageWindow = (page: number, size: number = PAGE_SIZE) => ({
  limit: size,
  offset: (page - 1) * size,
});

// The page sizes a token list offers. Each fills whole rows in one of the Panel's
// grids, so a size outside them is a Panel bug and is refused.
export const PAGE_SIZES = [6, 10, 20, 24, 50] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

// Matched as exact text, as the page is, so "010" and "1e1" are refused rather than
// read as ten.
export const pageSizeQuery = (fallback: PageSize) =>
  z
    .enum(PAGE_SIZES.map(String), { error: `one of ${PAGE_SIZES.join(", ")}` })
    .default(String(fallback))
    .transform((size) => Number(size) as PageSize);

// An address in any letter case, lowercased because the indexer holds every address
// that way. Its capitals are not checked against a checksum, unlike chainAddress: it
// only narrows a public list, so a mistyped address lists nothing and opens nothing.
export const anyCaseAddress = (label: string) =>
  z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, label)
    .transform((address) => address.toLowerCase());
