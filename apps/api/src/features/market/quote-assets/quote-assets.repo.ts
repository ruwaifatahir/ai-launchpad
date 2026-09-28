import { readIndexer } from "@/lib/indexer/client";

// A quote asset as the Pair filter offers it. The address is lowercase, as the indexer
// writes it, and the zero address is native ETH, which the indexer names ETH.
export interface QuoteAssetRow {
  address: string;
  symbol: string;
  decimals: number;
}

// Every quote asset some launch uses, each once. The indexer reads a quote asset's
// symbol and decimals once and copies them onto every launch, so they agree across
// launches. DISTINCT ON the address still keeps one row per address, should they not.
// Two addresses sharing a symbol stay apart: only the address says which is which.
// Ordered by symbol, then address, so the list keeps its order between polls.
export const findQuoteAssets = () =>
  readIndexer<QuoteAssetRow>(
    "lists",
    `SELECT address, symbol, decimals
     FROM (
       SELECT DISTINCT ON (quote_asset)
         quote_asset AS address,
         quote_asset_symbol AS symbol,
         quote_asset_decimals AS decimals
       FROM indexer.launch
       ORDER BY quote_asset, launch_timestamp DESC, token
     ) AS used
     ORDER BY symbol, address`,
    [],
  );
