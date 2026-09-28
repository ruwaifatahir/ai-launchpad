import type { Address } from "viem";
import { env } from "@/config/env";

// The Chainlink feed each quote asset is priced by, by the quote asset's lowercase
// address as the indexer writes it, native under the zero address. Each feed answers
// in US dollars. They come from NATIVE_USD_FEED and QUOTE_ASSET_USD_FEEDS, because
// which feeds exist is a fact about the chain a deployment runs on. A quote asset with
// no feed has no dollar rate.
//
// Empty while dollar rates are off, so nothing reads a feed then.
export const feedsHere = (): Readonly<Record<string, Address>> =>
  env.DOLLAR_RATES ? env.DOLLAR_RATE_FEEDS : {};
