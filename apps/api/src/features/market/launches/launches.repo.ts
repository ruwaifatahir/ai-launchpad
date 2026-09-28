import { readIndexer } from "@/lib/indexer/client";

// The indexer's launch row: the token's curve and creator, its quote asset and its
// current supply. supply is numeric in the indexer and leaves as text, so it stays
// exact. The addresses are lowercase, as the indexer writes them.
export interface LaunchRow {
  curve: string;
  creator: string;
  quoteAddress: string;
  quoteSymbol: string;
  quoteDecimals: number;
  supply: string;
}

// Null when the indexer holds no launch for the token. The indexer writes addresses in
// lowercase, so the token arrives lowercased.
export const findLaunchByToken = async (token: string): Promise<LaunchRow | null> => {
  const [launch] = await readIndexer<LaunchRow>(
    "token-page",
    `SELECT curve,
            creator,
            quote_asset AS "quoteAddress",
            quote_asset_symbol AS "quoteSymbol",
            quote_asset_decimals AS "quoteDecimals",
            supply::text AS supply
     FROM indexer.launch
     WHERE token = $1`,
    [token],
  );

  return launch ?? null;
};
