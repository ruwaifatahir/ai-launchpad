import { readIndexer } from "@/lib/indexer/client";
import type { TradeAmounts } from "@/features/market/pricing";

// One bucket of a token's trades. Every numeric leaves as text, so the amounts stay
// exact until the domain turns them into a price and a volume. tokenAmount and
// quoteAmount are the bucket's last trade, which sets its price.
export interface BucketRow extends TradeAmounts {
  // The bucket's start, in unix seconds.
  t: string;
  tradeCount: number;
  // The quote asset traded in the bucket, raw.
  volume: string;
}

// The last trade first: the latest timestamp, then the later block, then the later log.
const LATEST_FIRST = `"timestamp" DESC, block_number DESC, log_index DESC`;

// Every trade from the given second on, grouped into buckets of bucketSeconds counted
// from the unix epoch, oldest first. Only buckets holding a trade come back. Every
// kind counts, buybacks and fee conversions included, because each moves the price.
export const findChartBuckets = (
  token: string,
  window: { from: number; bucketSeconds: number },
) =>
  readIndexer<BucketRow>(
    "token-page",
    `SELECT ("timestamp" - mod("timestamp", $3))::text AS t,
            count(*)::int AS "tradeCount",
            sum(quote_amount)::text AS volume,
            (array_agg(launch_token_amount::text ORDER BY ${LATEST_FIRST}))[1] AS "tokenAmount",
            (array_agg(quote_amount::text ORDER BY ${LATEST_FIRST}))[1] AS "quoteAmount"
     FROM indexer.trade
     WHERE launch = $1 AND "timestamp" >= $2
     GROUP BY 1
     ORDER BY min("timestamp")`,
    [token, window.from, window.bucketSeconds],
  );

// The last trade at or before the given second, whose price is where a range opened.
// Null when the token had not traded by then.
export const findLastTradeAtOrBefore = async (
  token: string,
  at: number,
): Promise<TradeAmounts | null> => {
  const [trade] = await readIndexer<TradeAmounts>(
    "token-page",
    `SELECT launch_token_amount::text AS "tokenAmount",
            quote_amount::text AS "quoteAmount"
     FROM indexer.trade
     WHERE launch = $1 AND "timestamp" <= $2
     ORDER BY ${LATEST_FIRST}
     LIMIT 1`,
    [token, at],
  );

  return trade ?? null;
};
