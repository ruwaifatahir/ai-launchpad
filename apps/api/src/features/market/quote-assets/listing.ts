import { cachedMarketList } from "@/features/market/cache";
import { findQuoteAssets } from "@/features/market/quote-assets/quote-assets.repo";

// The quote assets the Pair filter offers. The route takes no query, so every visitor
// shares one entry.
export const listQuoteAssets = () =>
  cachedMarketList("quote-assets", {}, async () => ({
    quoteAssets: await findQuoteAssets(),
  }));
