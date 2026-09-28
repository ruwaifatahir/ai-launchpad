import { isAddress, zeroAddress } from "viem";
import type { Address } from "viem";
import { z } from "zod";
import { chainAddress } from "@/lib/chain/address";
import { encryptionKey } from "@/lib/encryption/key";
import { uploadthingToken } from "@/lib/logo-store/token";

// Every configuration value the app reads, and what each one must be. It sits apart
// from src/config/env.ts, which parses process.env with it and exits on a failure, so
// the rules are provable: env.ts is mocked in every test, and a check written there is
// a check no test can fail for.

// A switch. Unset and empty both mean off, because a deploy target that injects a
// declared variable as an empty string would otherwise refuse to boot. Anything else
// that is not "true" or "false" does refuse, because a value read as off when someone
// typed it to mean on is worse than a boot that stops and says why.
const flag = z
  .enum(["true", "false", ""])
  .default("false")
  .transform((value) => value === "true");

// An optional address. Empty means unset, for the same reason as a switch.
const optionalAddress = z
  .union([chainAddress, z.literal("")])
  .default("")
  .transform((value) => (value === "" ? undefined : value));

// Comma separated quote asset to feed pairs, each "0xQuoteAsset:0xFeed". The quote
// asset is lowercased, which is how the indexer writes it and how every lookup keys it.
const feedMap = z
  .string()
  .default("")
  .transform((value, ctx) => {
    const feeds: Record<string, Address> = {};

    for (const pair of value.split(",").map((entry) => entry.trim())) {
      if (!pair) continue;

      const [quoteAsset, feed, ...rest] = pair.split(":").map((part) => part.trim());

      if (
        !quoteAsset ||
        !feed ||
        rest.length > 0 ||
        !isAddress(quoteAsset) ||
        !isAddress(feed)
      ) {
        ctx.addIssue({
          code: "custom",
          message: `supply each pair as 0xQuoteAsset:0xFeed, not "${pair}"`,
        });
        return z.NEVER;
      }

      feeds[quoteAsset.toLowerCase()] = feed;
    }

    return feeds;
  });

const baseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "staging", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  // How many reverse proxies sit in front of the app. Express reads the client IP
  // from X-Forwarded-For only across this many hops, so the IP rate limits key on
  // the caller rather than on the proxy every request arrives through. Zero trusts
  // no forwarding header at all, which is right for a process nobody proxies.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  DATABASE_URL: z.url(),
  REDIS_URL: z.string().min(1),
  // The indexer's own database, read as a user that may only select from its indexer
  // schema. Required like DATABASE_URL, so a deploy that forgot it fails at boot rather
  // than on the first token page. A separate database keeps the indexer the only writer
  // of chain data.
  INDEXER_DATABASE_URL: z.url(),

  CHAIN_ID: z.coerce.number().int().positive(),
  RPC_URL: z.url(),
  // One factory holds every token, whatever it trades against, so the creator is
  // read from this single address. Graduation is read from the indexer, not here.
  FACTORY_ADDRESS: chainAddress,
  // The launchpad contracts that hold every token as part of its workings, so the
  // holders list can say which one a protocol holder is. The PoolManager is Uniswap's,
  // and holds every graduated pool's tokens. The others are the launchpad's own.
  POOL_MANAGER_ADDRESS: chainAddress,
  HOOK_ADDRESS: chainAddress,
  LOCKER_ADDRESS: chainAddress,
  BUYBACK_VAULT_ADDRESS: chainAddress,
  // Comma separated. Feeds both the CORS allowlist and the SIWE domain check,
  // so the origin a browser may call from and the domain a wallet may sign for
  // can never drift apart.
  PANEL_ORIGINS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .refine((origins) => origins.length > 0, "supply at least one panel origin"),
  JWT_SECRET: z.string().min(32),
  ADMIN_API_KEY: z.string().min(32),

  // Where logos are stored. One UploadThing app per environment, so a staging upload
  // can never touch a production logo. Required rather than optional: a launch
  // writes the logo's address on chain for good, so a deploy that cannot store one
  // should say so at boot rather than on the first creator who picks a picture.
  UPLOADTHING_TOKEN: uploadthingToken,

  // Serves each quote asset's dollar rate beside the market figures, read from
  // Chainlink. Off serves none, and so does on with no feed configured.
  DOLLAR_RATES: flag,
  // The chain the feeds live on. Both fall back to CHAIN_ID and RPC_URL, which suits
  // a chain Chainlink publishes on. A testnet can point at its mainnet here instead,
  // so its quote assets are priced by the real assets they stand in for.
  DOLLAR_RATE_RPC_URL: z.union([z.url(), z.literal("")]).default(""),
  DOLLAR_RATE_CHAIN_ID: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .default(""),
  // The feed that prices the chain's native token, which the indexer writes as the
  // zero address.
  NATIVE_USD_FEED: optionalAddress,
  // The feed that prices each ERC-20 quote asset. A quote asset with none has no rate.
  QUOTE_ASSET_USD_FEEDS: feedMap,

  // The AI agent that posts to X for a token, and everything behind it: the X
  // connection, the previews, the posting worker. Off by default, so a launchpad runs
  // without an X app or a model provider. While off, the variables below are neither
  // required nor read, and the agent routes answer 404.
  AGENTS_ENABLED: flag,
  // The model every agent writes with. The tier suffix is load bearing: the bare
  // gpt-5.6 alias routes to a tier twenty times the input price for the same post,
  // and the costs recorded per post assume this default. Empty means the default.
  // Parsed whether or not agents are on, because the writer is built at import.
  AI_MODEL: z
    .string()
    .default("")
    .transform((value) => value.trim() || "openai/gpt-5.6-luna"),

  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

// Required only while AGENTS_ENABLED is on, and then exactly as strict as the rest.
const agentSchema = z.object({
  // Encrypts every X credential at rest. Rotating it disconnects every agent.
  ENCRYPTION_KEY: encryptionKey,

  // The app registered at X, which every creator's account connects to.
  X_CLIENT_ID: z.string().min(1),
  X_CLIENT_SECRET: z.string().min(1),
  // Configured in full rather than assembled. X matches this against one of the
  // ten URLs registered in its console exactly, trailing slash included, so a URL
  // the app builds is a URL that can silently stop matching.
  X_CALLBACK_URL: z.url(),
  // Withholds the one call that publishes. Every gate, the credential, the renewal
  // and the writer still run, so a slot costs the model and nothing else. Parsed as
  // a switch, because a value read as off when someone typed it to mean on publishes
  // to X for real in a creator's name.
  X_DRY_RUN: flag,

  // Mastra reads this itself when an agent writes, so nothing in src/ ever looks
  // it up. It is required here anyway: without this line a missing key surfaces
  // on the first post of the day instead of at startup.
  OPENAI_API_KEY: z.string().min(1),
});

type BaseEnv = z.infer<typeof baseSchema>;
type AgentEnv = z.infer<typeof agentSchema>;

export type Env = Omit<BaseEnv, "DOLLAR_RATE_RPC_URL" | "DOLLAR_RATE_CHAIN_ID"> &
  AgentEnv & {
    DOLLAR_RATE_RPC_URL: string;
    DOLLAR_RATE_CHAIN_ID: number;
    // Every quote asset with a feed, the native token under the zero address.
    DOLLAR_RATE_FEEDS: Readonly<Record<string, Address>>;
    isProduction: boolean;
    isDeployed: boolean;
  };

export type EnvResult =
  | { success: true; data: Env }
  | { success: false; errors: Record<string, string[] | undefined> };

export const parseEnv = (source: Record<string, string | undefined>): EnvResult => {
  const base = baseSchema.safeParse(source);
  const agentsOn = source.AGENTS_ENABLED === "true";
  const agents = agentsOn ? agentSchema.safeParse(source) : undefined;

  if (!base.success || (agents && !agents.success)) {
    return {
      success: false,
      errors: {
        ...(base.success ? {} : z.flattenError(base.error).fieldErrors),
        ...(agents && !agents.success ? z.flattenError(agents.error).fieldErrors : {}),
      },
    };
  }

  const data = base.data;

  // Staging is public, so it counts as deployed wherever the question is what a
  // stranger may see: stack traces stay out of responses and logs are JSON for the
  // shipper.
  const isDeployed = ["production", "staging"].includes(data.NODE_ENV);

  return {
    success: true,
    data: {
      ...data,
      // Typed as present, because only the agent features read these and none of them
      // is mounted or started while AGENTS_ENABLED is off. X_DRY_RUN is off then, so
      // nothing that logs it claims a dry run that is not happening.
      ...(agents?.data ?? ({ X_DRY_RUN: false } as AgentEnv)),
      DOLLAR_RATE_RPC_URL: data.DOLLAR_RATE_RPC_URL || data.RPC_URL,
      DOLLAR_RATE_CHAIN_ID: data.DOLLAR_RATE_CHAIN_ID || data.CHAIN_ID,
      DOLLAR_RATE_FEEDS: {
        ...(data.NATIVE_USD_FEED ? { [zeroAddress]: data.NATIVE_USD_FEED } : {}),
        ...data.QUOTE_ASSET_USD_FEEDS,
      },
      isProduction: data.NODE_ENV === "production",
      isDeployed,
    },
  };
};
