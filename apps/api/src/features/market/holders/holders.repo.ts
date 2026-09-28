import { readIndexer } from "@/lib/indexer/client";

// A holder's balance is numeric in the indexer and leaves as text, so it stays exact.
export interface HolderRow {
  wallet: string;
  balance: string;
}

// Every wallet the indexer ever saw holding the token keeps its row, so an empty one
// is a wallet that sold out. Neither count includes those. total is every listed row,
// protocol holders included, for paging. holderCount leaves the protocol holders out,
// so it counts real holders.
export const countHoldersByToken = async (token: string) => {
  const [counts] = await readIndexer<{ total: number; holderCount: number }>(
    "token-page",
    `SELECT count(*)::int AS total,
            (count(*) FILTER (WHERE NOT is_protocol))::int AS "holderCount"
     FROM indexer.holder
     WHERE launch = $1 AND balance > 0`,
    [token],
  );

  return counts;
};

// Largest balance first. Equal balances fall back to the wallet, so a holder never
// sits on two pages or on none. The order names holder.balance, because a bare balance
// would be the text column this query selects, and text sorts 9 above 10.
export const findHoldersByToken = (
  token: string,
  window: { limit: number; offset: number },
) =>
  readIndexer<HolderRow>(
    "token-page",
    `SELECT wallet,
            balance::text AS balance
     FROM indexer.holder
     WHERE launch = $1 AND balance > 0
     ORDER BY holder.balance DESC, wallet
     LIMIT $2 OFFSET $3`,
    [token, window.limit, window.offset],
  );
