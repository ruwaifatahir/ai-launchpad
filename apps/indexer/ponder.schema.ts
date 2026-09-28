import { index, onchainEnum, onchainTable, primaryKey, sql } from "ponder";

// One row per launch, written when the factory emits TokenLaunched. The API serves a
// token page from this row without reading the chain.
export const launch = onchainTable(
  "launch",
  (t) => ({
    token: t.hex().primaryKey(),
    chainId: t.integer().notNull(),
    curve: t.hex().notNull(),
    creator: t.hex().notNull(),
    // The zero address means native ETH.
    quoteAsset: t.hex().notNull(),
    // "ETH" for native ETH, otherwise the quote asset's own symbol().
    quoteAssetSymbol: t.text().notNull(),
    quoteAssetDecimals: t.integer().notNull(),
    launchConfigId: t.bigint().notNull(),
    // In the quote asset's raw units.
    graduationThreshold: t.bigint().notNull(),

    name: t.text().notNull(),
    symbol: t.text().notNull(),
    logo: t.text().notNull(),
    description: t.text().notNull(),
    // The launch's socials, set at launch and never changed. Null when the creator left one
    // unset.
    twitter: t.text(),
    telegram: t.text(),
    discord: t.text(),
    website: t.text(),
    farcaster: t.text(),
    // The creator tax, in basis points (100 = 1%), on the curve and in the pool alike. Set
    // at launch and never changed.
    creatorTaxBps: t.integer().notNull(),
    // As minted at launch, in the launch token's raw units (18 decimals). Burns lower the
    // real supply later; this column does not follow them.
    totalSupply: t.bigint().notNull(),
    // The supply now: totalSupply less every burn (a Transfer to the zero address). A
    // holder's share of supply is their balance divided by this.
    supply: t.bigint().notNull(),

    // Current price times supply, in the quote asset's raw units. Follows the curve until
    // the pool opens, then the pool. Set at launch, before any trade.
    marketCap: t.bigint().notNull(),
    // The quote the curve holds for trading, fees and creator tax left out, in the quote
    // asset's raw units: the curve's realQuoteReserve(). Graduation progress is this over
    // graduationThreshold. Frozen once the curve closes. Kept here rather than on curve,
    // beside the token reserve, because the Explore list reads it for progress.
    curveQuoteReserve: t.bigint().notNull(),
    // The latest user buy, on the curve or in the pool. The hook's buybacks do not count.
    // Null until the first buy.
    lastBuyTimestamp: t.bigint(),
    // All-time volume, user trades only, on the curve and in the pool: each trade's
    // quoteAmount, buys and sells together, in the quote asset's raw units. Volume over a
    // window is in launchHour.
    volume: t.bigint().notNull(),
    buyCount: t.integer().notNull(),
    sellCount: t.integer().notNull(),

    launchBlock: t.bigint().notNull(),
    launchTimestamp: t.bigint().notNull(),
    launchTransactionHash: t.hex().notNull(),

    // Set when the factory's PoolGraduated seeds the launch's Uniswap pool. Graduation
    // takes two transactions: LaunchSwept closes the curve, then PoolGraduated opens the
    // pool. A launch that is only swept, or ready but not swept (the curve's
    // AutoGraduationFailed), is not graduated yet.
    graduated: t.boolean().notNull(),
    graduationBlock: t.bigint(),
    graduationTimestamp: t.bigint(),
    graduationTransactionHash: t.hex(),
    // The Uniswap v4 pool id, from the hook's PoolRegistered, which comes just before
    // PoolGraduated in the same transaction.
    poolId: t.hex(),
  }),
  (table) => ({
    // The Explore list sorts every launch by one of these.
    marketCapIdx: index().on(table.marketCap),
    lastBuyIdx: index().on(table.lastBuyTimestamp),
    launchTimeIdx: index().on(table.launchTimestamp),
    volumeIdx: index().on(table.volume),
    // A wallet's own launches, newest first: WHERE creator = $1 ORDER BY launch_timestamp
    // DESC, token. Serves the count of them too. nullsFirst() because Ponder writes DESC as
    // DESC NULLS LAST, and Postgres will not serve a plain DESC (NULLS FIRST) from that,
    // even on a NOT NULL column.
    creatorLaunchTimeIdx: index().on(
      table.creator,
      table.launchTimestamp.desc().nullsFirst(),
      table.token,
    ),
    // The API's search finds q anywhere in the name or symbol, ILIKE '%q%', which a
    // btree cannot serve. Trigram indexes can, for a q of 3 or more characters. They need
    // the pg_trgm extension, which Ponder does not create: run CREATE EXTENSION IF NOT
    // EXISTS pg_trgm once per database before the first start. The operator class is written in SQL because
    // Ponder 0.17 drops one given with .op(), and a GIN index on text needs one.
    nameSearchIdx: index("launch_name_search_index").using(
      "gin",
      sql`${table.name} gin_trgm_ops`,
    ),
    symbolSearchIdx: index("launch_symbol_search_index").using(
      "gin",
      sql`${table.symbol} gin_trgm_ops`,
    ),
  }),
);

// Maps each bonding curve to its launch. Curve events carry no token, so a curve trade
// finds its launch here. Written with the launch row. Also holds what the curve's price
// needs besides launch.curveQuoteReserve.
export const curve = onchainTable("curve", (t) => ({
  address: t.hex().primaryKey(),
  launch: t.hex().notNull(),
  // The curve's immutable phantomQuote: quote it prices with but does not hold.
  phantomQuote: t.bigint().notNull(),
  // The launch tokens the curve holds for trading. Frozen once the curve closes.
  tokenReserve: t.bigint().notNull(),
}));

// Maps each of our Uniswap pools to its launch. Pool trades come from hook events that
// carry only the pool id, and find their launch here. Written from PoolRegistered.
export const pool = onchainTable("pool", (t) => ({
  id: t.hex().primaryKey(),
  launch: t.hex().notNull(),
  // The pool's current price, Uniswap's sqrtPriceX96. Null until PoolGraduated, which
  // comes after the pool is initialized.
  sqrtPriceX96: t.bigint(),
}));

// Where a trade happened: the curve before graduation, the pool after it.
export const venue = onchainEnum("venue", ["curve", "pool"]);
export const side = onchainEnum("side", ["buy", "sell"]);
// A user's trade, or one the hook makes itself with collected fees.
export const tradeKind = onchainEnum("trade_kind", ["user", "buyback", "fee_conversion"]);
// What a trade's fee and creator tax are paid in.
export const feeAsset = onchainEnum("fee_asset", ["quote_asset", "launch_token"]);

// One row per trade of a launch token, on the curve or in the pool. Price is
// quoteAmount / launchTokenAmount; the API computes it, and builds chart candles from
// these rows on request.
export const trade = onchainTable(
  "trade",
  (t) => ({
    // chainId:block:transactionHash:logIndex, the same form as Pons's trade ids.
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    // The launch token.
    launch: t.hex().notNull(),
    venue: venue("venue").notNull(),
    kind: tradeKind("kind").notNull(),
    side: side("side").notNull(),
    // The wallet that signed the transaction, whatever contract it went through.
    trader: t.hex().notNull(),
    // Raw units of the launch token (18 decimals).
    launchTokenAmount: t.bigint().notNull(),
    // Raw units of the quote asset: what the trader paid on a buy, what they received on
    // a sell. On the curve that is fees included on a buy and after fees on a sell, which
    // is what reproduces Pons's chart prices (see src/trades.ts). In the pool it is the
    // Uniswap Swap's amount, before the hook's fee, as Pons shows it.
    quoteAmount: t.bigint().notNull(),
    // Raw units of feeAsset. On a curve buy the fee includes any snipe tax.
    fee: t.bigint().notNull(),
    creatorTax: t.bigint().notNull(),
    // Always the quote asset on the curve. In the pool the hook takes its fee from the
    // side the trader did not fix, so an exact-input buy pays it in the launch token.
    feeAsset: feeAsset("fee_asset").notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
    // On the curve, the CurveBuy's or CurveSell's; in the pool, the Uniswap Swap's.
    logIndex: t.integer().notNull(),
  }),
  (table) => ({
    launchTimeIdx: index().on(table.launch, table.timestamp),
  }),
);

// One row per launch and UTC hour with a user trade in it, holding that hour's totals,
// counted as launch.volume is. An hour with no row had no user trade. Volume over the last
// 24 hours or 7 days is the sum of the launch's last 24 or 168 hours, so a window can
// miss up to its first hour.
export const launchHour = onchainTable(
  "launch_hour",
  (t) => ({
    // The launch token.
    launch: t.hex().notNull(),
    // The hour's start, in seconds.
    hour: t.bigint().notNull(),
    // In the quote asset's raw units.
    volume: t.bigint().notNull(),
    buyCount: t.integer().notNull(),
    sellCount: t.integer().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.launch, table.hour] }),
    // Explore ranks every launch by its volume since some hour.
    hourIdx: index().on(table.hour),
  }),
);

// One row per launch and wallet that ever held its launch token, kept from the token's
// Transfer events, mints and burns included. The zero address is never a holder. A wallet
// that sold out keeps its row, with a zero balance.
export const holder = onchainTable(
  "holder",
  (t) => ({
    // The launch token.
    launch: t.hex().notNull(),
    wallet: t.hex().notNull(),
    // Raw units of the launch token (18 decimals).
    balance: t.bigint().notNull(),
    // The launch's curve, the PoolManager, the locker, the buyback vault or the burn
    // address: listed with a tag, not counted. The holder count is a launch's rows with a
    // balance above zero that are not protocol holders.
    isProtocol: t.boolean().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.launch, table.wallet] }),
    launchBalanceIdx: index().on(table.launch, table.balance),
  }),
);
