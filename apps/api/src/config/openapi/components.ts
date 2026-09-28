// The reusable half of the OpenAPI document: every schema, parameter and response more
// than one route points at. Routes document themselves in @openapi blocks beside the
// handler and reach in here with $ref, so a shape is written once and cannot drift
// between the routes that share it.
//
// OpenAPI 3.1, so a nullable field is a type list that includes "null" and an example
// is an examples array, both straight JSON Schema.

import { MAX_PAGE, PAGE_SIZE, PAGE_SIZES } from "@/features/market/request";
import {
  EXPLORE_SORTS,
  LIST_AGES,
  SEARCH_SORTS,
} from "@/features/market/tokens/domain/schema";

type Schema = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const nullable = (type: string, extra: Schema = {}): Schema => ({
  type: [type, "null"],
  ...extra,
});

const timestamp = (description: string): Schema => ({
  type: "string",
  format: "date-time",
  description,
});

const nullableTimestamp = (description: string): Schema =>
  nullable("string", { format: "date-time", description });

// A raw integer amount. A string, because it can pass what a float holds exactly.
const rawAmount = (description: string): Schema => ({
  type: "string",
  pattern: "^[0-9]+$",
  description,
  examples: ["1500000000000000000"],
});

// The fields the market responses share, each written once.
const tokenDecimals: Schema = { type: "integer", const: 18 };

const supply = rawAmount("The token's current supply, after burns, in tokenDecimals");

const quoteAsset: Record<string, Schema> = {
  quoteDecimals: { type: "integer", minimum: 0, examples: [18] },
  quoteSymbol: {
    type: "string",
    description: "ETH for native ETH, otherwise the quote asset's own symbol",
    examples: ["ETH"],
  },
};

// The quote asset's dollar rate, which the Panel multiplies its figures by.
const quoteUsd = nullable("number", {
  description:
    "What one whole unit of the quote asset is worth in US dollars, read from the Chainlink feed the deployment configures for it. Null where dollar rates are off, for a quote asset with no feed, and when the feed cannot be read.",
  examples: [225.66],
});

// A figure in US dollars, null where it cannot be priced.
const dollars = (description: string) =>
  nullable("number", { minimum: 0, description, examples: [12345.67] });

const paging: Record<string, Schema> = {
  page: { type: "integer", minimum: 1, maximum: MAX_PAGE },
  pageSize: { type: "integer", const: PAGE_SIZE },
};

// The page query every paged market route takes. of says what a page holds.
const pageParameter = (of: string) => ({
  in: "query",
  name: "page",
  required: false,
  description: `Which page of ${of}, from 1. Digits only: 1e1 or 0x2 is refused with a 400.`,
  schema: { type: "integer", minimum: 1, maximum: MAX_PAGE, default: 1 },
});

// What each successful route puts under data. The envelope around it is added below,
// once, so every one of these reads as the resource alone.
const data: Record<string, Schema> = {
  Nonce: {
    type: "object",
    required: ["nonce"],
    properties: {
      nonce: {
        type: "string",
        description: "Goes into the SIWE message. Lives five minutes, accepted once.",
        examples: ["x7Kq2mLp9sVb4nRt1"],
      },
    },
  },
  SessionCredential: {
    type: "object",
    required: ["token"],
    properties: {
      token: {
        type: "string",
        description:
          "The bearer credential. Send it as `Authorization: Bearer <token>`. It lasts seven days.",
      },
    },
  },
  SessionWallet: {
    type: "object",
    required: ["wallet"],
    properties: { wallet: ref("WalletAddress") },
  },
  Health: {
    type: "object",
    required: ["database", "redis"],
    properties: {
      database: { type: "string", const: "up" },
      redis: { type: "string", const: "up" },
    },
  },
  Agent: {
    type: "object",
    required: [
      "token",
      "name",
      "personality",
      "lore",
      "style",
      "topics",
      "pace",
      "pausedAt",
      "stoppedAt",
      "graduatedAt",
    ],
    properties: {
      token: ref("TokenAddress"),
      name: nullable("string", { maxLength: 40 }),
      personality: nullable("string", { maxLength: 1000 }),
      lore: nullable("string", { maxLength: 2000 }),
      style: nullable("string", { maxLength: 500 }),
      topics: ref("Topics"),
      pace: ref("Pace"),
      pausedAt: nullableTimestamp("When the creator silenced the agent"),
      stoppedAt: nullableTimestamp("When an AI Launchpad admin stopped the agent"),
      graduatedAt: nullableTimestamp(
        "When the token's Uniswap pool opened, read from the indexer. Null is a locked agent.",
      ),
    },
  },
  AgentRevision: {
    type: "object",
    required: [
      "token",
      "name",
      "personality",
      "lore",
      "style",
      "topics",
      "pace",
      "updatedAt",
    ],
    properties: {
      token: ref("TokenAddress"),
      name: nullable("string", { maxLength: 40 }),
      personality: nullable("string", { maxLength: 1000 }),
      lore: nullable("string", { maxLength: 2000 }),
      style: nullable("string", { maxLength: 500 }),
      topics: ref("Topics"),
      pace: ref("Pace"),
      updatedAt: timestamp("When this write landed"),
    },
  },
  AgentPause: {
    type: "object",
    required: ["token", "pausedAt", "updatedAt"],
    properties: {
      token: ref("TokenAddress"),
      pausedAt: nullableTimestamp(
        "When the agent was first silenced. Null once running.",
      ),
      updatedAt: timestamp("When this write landed"),
    },
  },
  AgentStop: {
    type: "object",
    required: ["token", "stoppedAt", "updatedAt"],
    properties: {
      token: ref("TokenAddress"),
      stoppedAt: timestamp("When the agent was first stopped. Never cleared."),
      updatedAt: timestamp("When this write landed"),
    },
  },
  ConsentText: {
    type: "object",
    required: ["token", "version", "title", "sections"],
    properties: {
      token: ref("TokenAddress"),
      version: { type: "integer", minimum: 1, description: "Send this back to agree" },
      title: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          required: ["heading", "points"],
          properties: {
            heading: { type: "string" },
            points: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
  ConsentRecord: {
    type: "object",
    required: ["token", "version", "agreedAt"],
    properties: {
      token: ref("TokenAddress"),
      version: { type: "integer", minimum: 1 },
      agreedAt: timestamp("When the creator agreed"),
    },
  },
  AuthorizationUrl: {
    type: "object",
    required: ["url"],
    properties: {
      url: {
        type: "string",
        format: "uri",
        description: "Where to send the creator's browser to authorize at X",
      },
    },
  },
  Attestation: {
    type: "object",
    required: ["token", "confirmedAt"],
    properties: {
      token: ref("TokenAddress"),
      confirmedAt: timestamp("When the confirmation was recorded"),
    },
  },
  Connection: {
    type: "object",
    required: ["token", "xUsername", "confirmedAt", "outstandingGate", "disconnected"],
    properties: {
      token: ref("TokenAddress"),
      xUsername: nullable("string", {
        description: "The handle as it was when the account connected",
      }),
      confirmedAt: nullableTimestamp(
        "When the creator confirmed the automated label and the bio link",
      ),
      outstandingGate: {
        type: ["string", "null"],
        enum: ["consent", "authorization", "attestation", null],
        description: "The step the creator still has to take. Null when none is left.",
      },
      disconnected: {
        type: "boolean",
        description: "True when the creator agreed but no X account is connected now",
      },
    },
  },
  Disconnection: {
    type: "object",
    required: ["token"],
    properties: { token: ref("TokenAddress") },
  },
  PreviewAllowance: {
    type: "object",
    required: ["allowance", "remaining", "resetsAt"],
    properties: {
      allowance: { type: "integer", minimum: 0, description: "Previews a day" },
      remaining: { type: "integer", minimum: 0, description: "Previews left today" },
      resetsAt: timestamp("The next midnight UTC"),
    },
  },
  Preview: {
    type: "object",
    required: ["text", "reason", "allowance", "remaining", "resetsAt"],
    properties: {
      text: nullable("string", { maxLength: 280, description: "The post, never sent" }),
      reason: {
        type: ["string", "null"],
        enum: ["refused", "unpublishable", null],
        description: "Why there is no text. Null when there is.",
      },
      allowance: { type: "integer", minimum: 0 },
      remaining: { type: "integer", minimum: 0 },
      resetsAt: timestamp("The next midnight UTC"),
    },
  },
  Logo: {
    type: "object",
    required: ["url"],
    properties: {
      url: {
        type: "string",
        format: "uri",
        maxLength: 512,
        description: "Where the logo is served from. Written on chain at launch.",
        examples: [
          "https://abc123.ufs.sh/f/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08.webp",
        ],
      },
    },
  },
  Trade: {
    type: "object",
    required: [
      "id",
      "side",
      "kind",
      "venue",
      "trader",
      "tokenAmount",
      "quoteAmount",
      "price",
      "timestamp",
      "transactionHash",
    ],
    properties: {
      id: {
        type: "string",
        description: "chainId:block:transactionHash:logIndex",
        examples: ["46630:124000512:0x5f1c...9a2e:7"],
      },
      side: { type: "string", enum: ["buy", "sell"] },
      kind: {
        type: "string",
        enum: ["user", "buyback", "fee_conversion"],
        description:
          "user is a person trading. buyback and fee_conversion are the protocol's own trades with collected fees.",
      },
      venue: {
        type: "string",
        enum: ["curve", "pool"],
        description: "The bonding curve before graduation, the Uniswap pool after it",
      },
      trader: {
        type: "string",
        description: "The wallet that signed the transaction, in lowercase",
      },
      tokenAmount: rawAmount("Tokens traded, in tokenDecimals"),
      quoteAmount: rawAmount(
        "Quote asset paid on a buy or received on a sell, in quoteDecimals",
      ),
      price: nullable("number", {
        description: "Quote asset per token, each in its own decimals",
        examples: [0.0000012],
      }),
      timestamp: {
        type: "integer",
        description: "The block's time, in unix seconds",
        examples: [1790000000],
      },
      transactionHash: { type: "string", examples: ["0x5f1c...9a2e"] },
    },
  },
  TradePage: {
    type: "object",
    required: [
      "tokenDecimals",
      "quoteDecimals",
      "quoteSymbol",
      "page",
      "pageSize",
      "total",
      "trades",
    ],
    properties: {
      tokenDecimals,
      ...quoteAsset,
      ...paging,
      total: { type: "integer", minimum: 0, description: "Every trade the token has" },
      trades: { type: "array", maxItems: PAGE_SIZE, items: ref("Trade") },
    },
  },
  ChartPoint: {
    type: "object",
    required: ["t", "price", "volume", "tradeCount"],
    properties: {
      t: {
        type: "integer",
        description: "The bucket's start, in unix seconds",
        examples: [1790000010],
      },
      price: nullable("number", {
        description:
          "The bucket's last trade: quote asset per token, each in its own decimals",
        examples: [0.0000012],
      }),
      volume: {
        type: "number",
        minimum: 0,
        description: "Quote asset traded in the bucket, in whole units",
        examples: [0.35],
      },
      tradeCount: { type: "integer", minimum: 1 },
    },
  },
  Chart: {
    type: "object",
    required: [
      "range",
      "bucketSeconds",
      "tokenDecimals",
      "supply",
      "quoteDecimals",
      "quoteSymbol",
      "quoteUsd",
      "change",
      "points",
    ],
    properties: {
      range: ref("ChartRange"),
      bucketSeconds: {
        type: "integer",
        enum: [15, 60, 300, 3600],
        description: "How wide each point's bucket is",
      },
      tokenDecimals,
      supply,
      ...quoteAsset,
      quoteUsd,
      change: nullable("number", {
        description:
          "Percent from the price when the range began to the latest price. 2.78 is up 2.78%. Null with no trade at all.",
        examples: [2.78],
      }),
      points: {
        type: "array",
        items: ref("ChartPoint"),
        description: "Only buckets holding a trade, oldest first",
      },
    },
  },
  Holder: {
    type: "object",
    required: ["wallet", "balance", "share", "label"],
    properties: {
      wallet: { type: "string", description: "The holding wallet, in lowercase" },
      balance: rawAmount("Tokens held, in tokenDecimals"),
      share: nullable("number", {
        description:
          "Percent of the current supply. 12.5 is 12.5%. Null only for a supply of zero.",
        examples: [12.5],
      }),
      label: {
        type: ["string", "null"],
        enum: [
          "bonding_curve",
          "uniswap_pool",
          "locker",
          "buyback_vault",
          "hook",
          "burn_address",
          "creator",
          null,
        ],
        description:
          "What the wallet is, when it is the launchpad's own contract or the token's creator. Null for anyone else.",
      },
    },
  },
  HolderPage: {
    type: "object",
    required: [
      "tokenDecimals",
      "supply",
      "page",
      "pageSize",
      "total",
      "holderCount",
      "holders",
    ],
    properties: {
      tokenDecimals,
      supply,
      ...paging,
      total: {
        type: "integer",
        minimum: 0,
        description: "Every holder with a balance, the launchpad's contracts included",
      },
      holderCount: {
        type: "integer",
        minimum: 0,
        description:
          "Holders with a balance that are not the launchpad's contracts. The creator counts.",
      },
      holders: { type: "array", maxItems: PAGE_SIZE, items: ref("Holder") },
    },
  },
  ListedToken: {
    type: "object",
    required: [
      "token",
      "name",
      "symbol",
      "logo",
      "creator",
      "marketCap",
      "quoteAsset",
      "quoteUsd",
      "progress",
      "graduated",
      "launchedAt",
      "lastBuyAt",
    ],
    properties: {
      token: ref("TokenAddress"),
      name: { type: "string" },
      symbol: { type: "string", description: "The ticker", examples: ["NEO"] },
      logo: {
        type: "string",
        description:
          "Exactly as the creator set it: an ipfs:// link, an https:// link, or empty. Never rewritten.",
        examples: ["ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"],
      },
      creator: { type: "string", description: "The launching wallet, in lowercase" },
      marketCap: rawAmount(
        "Price times current supply, in the quote asset's decimals. With dollar rates on, the market cap sorts rank it in dollars.",
      ),
      quoteAsset: ref("QuoteAsset"),
      quoteUsd,
      progress: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description:
          "Percent of the way to graduation. 100 once graduated, and capped at 100 for a curve that closed just past its threshold.",
        examples: [42.5],
      },
      graduated: {
        type: "boolean",
        description: "Whether the token's Uniswap pool has opened",
      },
      launchedAt: {
        type: "integer",
        description: "When the token launched, in unix seconds",
        examples: [1790000000],
      },
      lastBuyAt: nullable("integer", {
        description:
          "The latest user buy, on the curve or in the pool, in unix seconds. Null before the first buy.",
        examples: [1790000500],
      }),
      volume: rawAmount(
        "Served under the volume sort only. The user volume traded inside the sort's window, in the quote asset's decimals.",
      ),
    },
  },
  GraduatedPage: {
    type: "object",
    required: ["page", "pageSize", "total", "tokens"],
    properties: {
      page: paging.page,
      pageSize: ref("PageSize"),
      total: { type: "integer", minimum: 0, description: "Every graduated token" },
      tokens: {
        type: "array",
        maxItems: Math.max(...PAGE_SIZES),
        items: ref("ListedToken"),
        description: "Largest market cap first, then by token address",
      },
    },
  },
  CreatorPage: {
    type: "object",
    required: ["page", "pageSize", "total", "tokens"],
    properties: {
      page: paging.page,
      pageSize: ref("PageSize"),
      total: {
        type: "integer",
        minimum: 0,
        description: "Every token the wallet launched, graduated or not",
      },
      tokens: {
        type: "array",
        maxItems: Math.max(...PAGE_SIZES),
        items: ref("ListedToken"),
        description: "Newest launch first, then by token address",
      },
    },
  },
  ExplorePage: {
    type: "object",
    required: ["sort", "age", "page", "pageSize", "total", "launched", "tokens"],
    properties: {
      sort: ref("ExploreSort"),
      age: ref("ListAge"),
      page: paging.page,
      pageSize: ref("PageSize"),
      total: {
        type: "integer",
        minimum: 0,
        description: "Every token on its curve matching the sort and age",
      },
      launched: {
        type: "integer",
        minimum: 0,
        description: "Every token ever launched, graduated or not",
      },
      tokens: {
        type: "array",
        maxItems: Math.max(...PAGE_SIZES),
        items: ref("ListedToken"),
        description: "In the sort's order, then by token address",
      },
    },
  },
  SearchPage: {
    type: "object",
    required: ["sort", "age", "page", "pageSize", "total", "tokens"],
    properties: {
      sort: ref("SearchSort"),
      age: ref("ListAge"),
      page: paging.page,
      pageSize: ref("PageSize"),
      total: {
        type: "integer",
        minimum: 0,
        description: "Every token matching q, age and quote, graduated or not",
      },
      tokens: {
        type: "array",
        maxItems: Math.max(...PAGE_SIZES),
        items: ref("ListedToken"),
        description: "In the sort's order, then by token address",
      },
    },
  },
  QuoteAssetList: {
    type: "object",
    required: ["quoteAssets"],
    properties: {
      quoteAssets: {
        type: "array",
        items: ref("QuoteAsset"),
        description:
          "Every quote asset some token uses, each once, by symbol then address. Two sharing a symbol are listed apart.",
      },
    },
  },
  Analytics: {
    type: "object",
    required: [
      "lastFullDay",
      "totals",
      "lastDay",
      "priorDay",
      "series",
      "unpricedQuoteAssets",
    ],
    properties: {
      lastFullDay: nullable("integer", {
        description:
          "The start of the last full UTC day, in unix seconds, which every figure counts to. Null while the series is empty.",
        examples: [1790208000],
      }),
      totals: {
        type: "object",
        required: [
          "launches",
          "creators",
          "volumeUsd",
          "averageDailyVolumeUsd",
          "unpricedDays",
        ],
        properties: {
          launches: { type: "integer", minimum: 0, description: "Every token launched" },
          creators: {
            type: "integer",
            minimum: 0,
            description: "The wallets that launched a token, each counted once",
          },
          volumeUsd: dollars(
            "The volume of every priced day, in US dollars. Null while dollar rates are off.",
          ),
          averageDailyVolumeUsd: dollars(
            "volumeUsd over the number of days in the series. Null when volumeUsd is.",
          ),
          unpricedDays: {
            type: "integer",
            minimum: 0,
            description:
              "Days left out of volumeUsd because a quote asset that traded on them has no stored rate for the day",
          },
        },
      },
      lastDay: {
        oneOf: [ref("DayFigures"), { type: "null" }],
        description:
          "The last full UTC day, the series' last entry. Null when the series is empty.",
      },
      priorDay: {
        oneOf: [ref("DayFigures"), { type: "null" }],
        description: "The day before lastDay. Null when the series has no such day.",
      },
      series: {
        type: "array",
        items: ref("DayFigures"),
        description:
          "One entry per UTC day, oldest first, from the first launch's day to the last full day. A day with no activity is in it with zeros.",
      },
      unpricedQuoteAssets: {
        type: "array",
        items: {
          type: "object",
          required: ["address", "symbol"],
          properties: {
            address: { type: "string", description: "In lowercase" },
            symbol: { type: "string", examples: ["ETH"] },
          },
        },
        description:
          "Quote assets that traded but have no feed, so their volume is in no dollar figure. By address.",
      },
    },
  },
};

// Wraps a data schema in the envelope every successful reply carries.
const envelope = (name: string): Schema => ({
  allOf: [ref("SuccessEnvelope"), { type: "object", properties: { data: ref(name) } }],
});

const envelopes = Object.fromEntries(
  Object.keys(data).map((name) => [`${name}Response`, envelope(name)]),
);

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ref("ErrorResponse") } },
});

export const components = {
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "The session credential from POST /api/v1/auth/sessions",
    },
    adminKey: {
      type: "apiKey",
      in: "header",
      name: "X-Admin-Key",
      description: "The AI Launchpad admin key. Never sent in the Authorization header.",
    },
  },
  parameters: {
    TokenAddress: {
      in: "path",
      name: "token",
      required: true,
      description:
        "The token address, sent checksummed or in lowercase. A mixed case address whose capitals do not match its checksum is refused with a 400, because those capitals are the only evidence a mistyped address carries. The pattern is the shape only: it cannot express the checksum.",
      schema: ref("TokenAddress"),
    },
    Page: pageParameter(`${PAGE_SIZE}`),
    ListPage: pageParameter("pageSize tokens"),
  },
  schemas: {
    TokenAddress: {
      type: "string",
      pattern: "^0x[0-9a-fA-F]{40}$",
      description: "A token address, answered in lowercase",
      examples: ["0xa0cf798816d4b9b9866b5330eea46a18382f251e"],
    },
    WalletAddress: {
      type: "string",
      pattern: "^0x[0-9a-fA-F]{40}$",
      description: "A wallet address, checksummed",
      examples: ["0xA0Cf798816D4b9b9866b5330EEa46a18382f251e"],
    },
    Topics: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 60 },
      description: "What the agent talks about. Set whole, never appended to.",
    },
    ChartRange: {
      type: "string",
      enum: ["5m", "1h", "6h", "1d", "all"],
      description: "How far back a chart reaches. all reaches the token's first trade.",
    },
    PageSize: {
      type: "integer",
      enum: [...PAGE_SIZES],
      description:
        "Tokens a page. Each size fills whole rows in one of the Panel's grids.",
    },
    ExploreSort: {
      type: "string",
      enum: [...EXPLORE_SORTS],
      description:
        "recent-buys: the latest buy first, leaving out tokens nobody has bought. newest and oldest: by launch time. market-cap: largest first. volume: the volume inside the age window, largest first, leaving out tokens with none there.",
    },
    SearchSort: {
      type: "string",
      enum: [...SEARCH_SORTS],
      description:
        "relevance: an exact ticker, then a name or ticker starting with q, then one containing it, market cap breaking ties, and market cap alone for an empty q. market-cap: largest first. volume: the volume inside the age window, largest first, leaving out tokens with none there. newest and oldest: by launch time.",
    },
    ListAge: {
      type: "string",
      enum: [...LIST_AGES],
      description:
        "How far back a list reaches from now. Under recent-buys it measures the last buy. Under volume it picks the hours whose volume is summed, and all means all time. Under the other sorts it measures the launch.",
    },
    QuoteAsset: {
      type: "object",
      required: ["address", "symbol", "decimals"],
      properties: {
        address: {
          type: "string",
          description: "In lowercase. The zero address is native ETH.",
          examples: ["0x0000000000000000000000000000000000000000"],
        },
        symbol: {
          type: "string",
          description: "ETH for native ETH, otherwise the quote asset's own symbol",
          examples: ["ETH"],
        },
        decimals: { type: "integer", minimum: 0, examples: [18] },
      },
    },
    DayFigures: {
      type: "object",
      required: ["day", "launches", "volumeUsd"],
      properties: {
        day: {
          type: "integer",
          description: "The start of the UTC day, in unix seconds",
          examples: [1790208000],
        },
        launches: { type: "integer", minimum: 0 },
        volumeUsd: dollars(
          "The day's user volume in US dollars, at the day's own rate. Null while dollar rates are off, or when a quote asset with a feed traded that day and its rate is not stored yet.",
        ),
      },
    },
    Pace: {
      type: "integer",
      minimum: 1,
      maximum: 5,
      description: "Posts a day",
    },
    SuccessEnvelope: {
      type: "object",
      required: ["success", "statusCode", "message", "data"],
      properties: {
        success: { type: "boolean", const: true },
        statusCode: { type: "integer", examples: [200] },
        message: { type: "string", examples: ["Success"] },
        data: {},
      },
    },
    FieldError: {
      type: "object",
      required: ["path", "message"],
      properties: {
        path: {
          type: "string",
          description: "Where the field sits, such as body.pace",
          examples: ["body.pace"],
        },
        message: { type: "string", examples: ["Too big: expected number to be <=5"] },
      },
    },
    ErrorResponse: {
      type: "object",
      required: ["success", "statusCode", "code", "message"],
      properties: {
        success: { type: "boolean", const: false },
        statusCode: { type: "integer", examples: [409] },
        code: {
          type: "string",
          description:
            "What a client branches on. Stable once shipped, unlike the message. Generic codes follow the status (BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, TOO_MANY_REQUESTS, INTERNAL_ERROR, SERVICE_UNAVAILABLE); a rule several routes share has its own, named on the route.",
          examples: ["TOKEN_NOT_GRADUATED"],
        },
        message: { type: "string", description: "For a person. May be reworded." },
        errors: {
          type: "array",
          items: ref("FieldError"),
          description: "Present on VALIDATION_ERROR only",
        },
        requestId: {
          type: "string",
          description: "Quote this when asking for support. Also in X-Request-Id.",
        },
        stack: { type: "string", description: "Local development only" },
      },
    },
    ...data,
    ...envelopes,
  },
  // The generic description for each status. A route that has something specific to
  // say about a status writes its own description, and the error body is added to it
  // in src/config/swagger.ts either way.
  responses: {
    BadRequest: errorResponse("The request failed validation. errors names each field."),
    Unauthorized: errorResponse(
      "No credential, a tampered one, or one older than seven days",
    ),
    Forbidden: errorResponse("A token launched by another wallet"),
    NotFound: errorResponse("A token the launchpad does not know"),
    Conflict: errorResponse("The request breaks a rule. code names which."),
    TooManyRequests: errorResponse("Rate limited. Retry-After says when to try again."),
    InternalError: errorResponse("A fault of ours. Quote the requestId."),
    ServiceUnavailable: errorResponse("A dependency did not answer. Worth retrying."),
  },
} as const;
