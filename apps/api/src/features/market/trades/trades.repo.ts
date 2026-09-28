import { readIndexer } from "@/lib/indexer/client";

// Amounts and the timestamp are numeric in the indexer and leave as text, so an
// amount past what a float holds stays exact. The enums leave as text too: their
// types live in the indexer_<sha> schema behind the view, which this user cannot name.
export interface TradeRow {
  id: string;
  side: "buy" | "sell";
  kind: "user" | "buyback" | "fee_conversion";
  venue: "curve" | "pool";
  trader: string;
  tokenAmount: string;
  quoteAmount: string;
  timestamp: string;
  transactionHash: string;
}

export const countTradesByToken = async (token: string) => {
  const [counted] = await readIndexer<{ total: number }>(
    "token-page",
    `SELECT count(*)::int AS total FROM indexer.trade WHERE launch = $1`,
    [token],
  );

  return counted.total;
};

// Newest first. Trades in one block share a timestamp, so the block and then the log
// index settle the order within one.
export const findTradesByToken = (
  token: string,
  window: { limit: number; offset: number },
) =>
  readIndexer<TradeRow>(
    "token-page",
    `SELECT id,
            side::text AS side,
            kind::text AS kind,
            venue::text AS venue,
            trader,
            launch_token_amount::text AS "tokenAmount",
            quote_amount::text AS "quoteAmount",
            "timestamp"::text AS "timestamp",
            transaction_hash AS "transactionHash"
     FROM indexer.trade
     WHERE launch = $1
     ORDER BY "timestamp" DESC, block_number DESC, log_index DESC
     LIMIT $2 OFFSET $3`,
    [token, window.limit, window.offset],
  );
