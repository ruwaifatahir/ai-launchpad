import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { getAddress } from "viem";
import { parseEnv } from "@/config/env.schema";

const FEED = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";
const TOKEN = "0x0ae6ab900fc7f3be5bd9f5137827fa99200373f7";

// Everything a deployment with agents off must set, and nothing more.
const BASE: Record<string, string> = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/app",
  REDIS_URL: "redis://localhost:6379",
  INDEXER_DATABASE_URL: "postgresql://reader:reader@localhost:5432/indexer",
  CHAIN_ID: "46630",
  RPC_URL: "http://localhost:8545",
  FACTORY_ADDRESS: "0xFb51A8b33eF1B280ECAC995C7b2a4237EFC21DeC",
  POOL_MANAGER_ADDRESS: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  HOOK_ADDRESS: "0x6Bb597c89cD74147412833dDE425D600AD63e044",
  LOCKER_ADDRESS: "0xe11110818B36Cd568dC8A74990D6630764B09bcF",
  BUYBACK_VAULT_ADDRESS: "0x1642c6c8Bdcb418e8CA1645ec625527ECdaDe8DA",
  PANEL_ORIGINS: "http://localhost:5173",
  JWT_SECRET: "a-secret-of-at-least-32-characters-long",
  ADMIN_API_KEY: "an-admin-key-of-at-least-32-characters",
  UPLOADTHING_TOKEN: Buffer.from(JSON.stringify({ appId: "testapp" })).toString("base64"),
};

// What turning agents on adds.
const AGENTS: Record<string, string> = {
  AGENTS_ENABLED: "true",
  ENCRYPTION_KEY: "mUs1w6nW25m+UVHZ6/RKWEVY2ExfiaXh2YQWCZYAmDQ=",
  X_CLIENT_ID: "an-x-client-id",
  X_CLIENT_SECRET: "an-x-client-secret",
  X_CALLBACK_URL: "http://localhost:3000/api/v1/core/connections/callback",
  OPENAI_API_KEY: "an-openai-key",
};

const parsed = (source: Record<string, string>) => {
  const result = parseEnv(source);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.data;
};

const errorsOf = (source: Record<string, string>) => {
  const result = parseEnv(source);
  if (result.success) throw new Error("the environment was accepted");
  return result.errors;
};

describe("parseEnv, .env.example", () => {
  it("boots from the example once the logo store is filled in, so a copy of it is a working start", () => {
    const example = parse(readFileSync(".env.example", "utf8"));

    expect(
      parsed({ ...example, UPLOADTHING_TOKEN: BASE.UPLOADTHING_TOKEN }),
    ).toMatchObject({
      AGENTS_ENABLED: false,
      DOLLAR_RATES: false,
    });
  });
});

describe("parseEnv, with agents off", () => {
  it("boots with no X app, no model key and no encryption key, because nothing reads them", () => {
    const env = parsed(BASE);

    expect(env.AGENTS_ENABLED).toBe(false);
    expect(env.X_DRY_RUN).toBe(false);
  });

  it("still names a model, because the writer is built at import and refuses to be built without one", () => {
    expect(parsed(BASE).AI_MODEL).toBe("openai/gpt-5.6-luna");
  });

  it("is off when AGENTS_ENABLED is empty, as a deploy target that injects a declared variable blank would send it", () => {
    expect(parsed({ ...BASE, AGENTS_ENABLED: "" }).AGENTS_ENABLED).toBe(false);
  });

  it("refuses an AGENTS_ENABLED that is neither true nor false, rather than guessing which was meant", () => {
    expect(errorsOf({ ...BASE, AGENTS_ENABLED: "1" })).toHaveProperty("AGENTS_ENABLED");
  });

  it("still requires what every deployment needs", () => {
    const { UPLOADTHING_TOKEN: _, ...rest } = BASE;

    expect(errorsOf(rest)).toHaveProperty("UPLOADTHING_TOKEN");
  });
});

describe("parseEnv, with agents on", () => {
  it("boots with every agent variable set", () => {
    const env = parsed({ ...BASE, ...AGENTS });

    expect(env.AGENTS_ENABLED).toBe(true);
    expect(env.X_CLIENT_ID).toBe("an-x-client-id");
    expect(env.ENCRYPTION_KEY).toHaveLength(32);
  });

  it("requires every agent variable, and names each one missing", () => {
    const errors = errorsOf({ ...BASE, AGENTS_ENABLED: "true" });

    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining([
        "ENCRYPTION_KEY",
        "X_CLIENT_ID",
        "X_CLIENT_SECRET",
        "X_CALLBACK_URL",
        "OPENAI_API_KEY",
      ]),
    );
  });

  it("names a missing agent variable beside a missing base one, so one boot shows every problem", () => {
    const { JWT_SECRET: _, ...rest } = BASE;
    const { OPENAI_API_KEY: __, ...agents } = AGENTS;

    expect(Object.keys(errorsOf({ ...rest, ...agents }))).toEqual(
      expect.arrayContaining(["JWT_SECRET", "OPENAI_API_KEY"]),
    );
  });

  it("writes with the tier-suffixed model unless AI_MODEL names another, because the bare alias charges twenty times the input price", () => {
    expect(parsed({ ...BASE, ...AGENTS }).AI_MODEL).toBe("openai/gpt-5.6-luna");
    expect(parsed({ ...BASE, ...AGENTS, AI_MODEL: "" }).AI_MODEL).toBe(
      "openai/gpt-5.6-luna",
    );
    expect(
      parsed({ ...BASE, ...AGENTS, AI_MODEL: "openai/another-model" }).AI_MODEL,
    ).toBe("openai/another-model");
  });

  it("refuses an X_DRY_RUN that is neither true nor false, because one read as off publishes for real", () => {
    expect(errorsOf({ ...BASE, ...AGENTS, X_DRY_RUN: "1" })).toHaveProperty("X_DRY_RUN");
  });
});

describe("parseEnv, dollar rates", () => {
  it("configures no feed by default, so every dollar field is null even with the switch on", () => {
    const env = parsed({ ...BASE, DOLLAR_RATES: "true" });

    expect(env.DOLLAR_RATES).toBe(true);
    expect(env.DOLLAR_RATE_FEEDS).toEqual({});
  });

  it("reads the feeds from the app's own chain unless told otherwise", () => {
    const env = parsed(BASE);

    expect(env.DOLLAR_RATE_RPC_URL).toBe("http://localhost:8545");
    expect(env.DOLLAR_RATE_CHAIN_ID).toBe(46630);
  });

  it("reads the feeds from another chain when one is named", () => {
    const env = parsed({
      ...BASE,
      DOLLAR_RATE_RPC_URL: "https://rpc.example.com",
      DOLLAR_RATE_CHAIN_ID: "1",
    });

    expect(env.DOLLAR_RATE_RPC_URL).toBe("https://rpc.example.com");
    expect(env.DOLLAR_RATE_CHAIN_ID).toBe(1);
  });

  it("prices native under the zero address and each ERC-20 under its lowercase address", () => {
    const env = parsed({
      ...BASE,
      NATIVE_USD_FEED: FEED,
      QUOTE_ASSET_USD_FEEDS: ` ${getAddress(TOKEN)} : ${FEED} ,`,
    });

    expect(env.DOLLAR_RATE_FEEDS).toEqual({
      "0x0000000000000000000000000000000000000000": FEED.toLowerCase(),
      [TOKEN]: FEED,
    });
  });

  it("refuses a pair that is not two addresses, rather than pricing nothing without a word", () => {
    expect(errorsOf({ ...BASE, QUOTE_ASSET_USD_FEEDS: TOKEN })).toHaveProperty(
      "QUOTE_ASSET_USD_FEEDS",
    );
    expect(
      errorsOf({ ...BASE, QUOTE_ASSET_USD_FEEDS: `${TOKEN}:0xnotafeed` }),
    ).toHaveProperty("QUOTE_ASSET_USD_FEEDS");
  });

  it("refuses a native feed that is not an address", () => {
    expect(errorsOf({ ...BASE, NATIVE_USD_FEED: "0x123" })).toHaveProperty(
      "NATIVE_USD_FEED",
    );
  });
});
