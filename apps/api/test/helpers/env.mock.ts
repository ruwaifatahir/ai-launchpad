export const TEST_ENV: Record<string, unknown> = {
  NODE_ENV: "test",
  isProduction: false,
  isDeployed: false,
  PORT: 3000,
  TRUST_PROXY: 0,
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/app_test",
  REDIS_URL: "redis://localhost:6379",
  INDEXER_DATABASE_URL:
    "postgresql://launchpad_reader:reader@localhost:5432/indexer_test",
  CHAIN_ID: 46630,
  RPC_URL: "http://localhost:8545",
  FACTORY_ADDRESS: "0xfb51a8b33ef1b280ecac995c7b2a4237efc21dec",
  POOL_MANAGER_ADDRESS: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  HOOK_ADDRESS: "0x6bb597c89cd74147412833dde425d600ad63e044",
  LOCKER_ADDRESS: "0xe11110818b36cd568dc8a74990d6630764b09bcf",
  BUYBACK_VAULT_ADDRESS: "0x1642c6c8bdcb418e8ca1645ec625527ecdade8da",
  // Already split, because the real module transforms the comma separated string
  // into an array before anything reads it.
  PANEL_ORIGINS: ["http://localhost:5173"],
  JWT_SECRET: "test-secret-at-least-32-characters-long",
  ADMIN_API_KEY: "test-admin-key-at-least-32-characters-long",
  // On, so the agent routes and the posting workers exist for the tests that prove
  // them. A test of the off mode mocks the module with it off.
  AGENTS_ENABLED: true,
  // Already decoded, because the real module transforms the base64 key into the
  // thirty two bytes AES-256 takes before anything reads it. A real key rather
  // than a stub: the cipher is never mocked, so a test can prove that what
  // reaches Postgres is ciphertext.
  ENCRYPTION_KEY: Buffer.from("mUs1w6nW25m+UVHZ6/RKWEVY2ExfiaXh2YQWCZYAmDQ=", "base64"),
  X_CLIENT_ID: "test-x-client-id",
  X_CLIENT_SECRET: "test-x-client-secret",
  // In full, never assembled, exactly as the real module holds it. A test that
  // built this from a host and a path would pass while production sent X a URL
  // it never registered.
  X_CALLBACK_URL: "http://localhost:3000/api/v1/core/connections/callback",
  // Already a boolean, because the real module transforms the string before
  // anything reads it. Off here, so the default run proves the live path. A test
  // that needs the flag on sets it and sets it back.
  X_DRY_RUN: false,
  // Never read by anything in src/, because Mastra reads the key straight from
  // the environment. It is here so this mock stays a faithful mirror of what the
  // real module requires at boot.
  OPENAI_API_KEY: "test-openai-api-key",
  AI_MODEL: "openai/gpt-5.6-luna",
  // Never sent anywhere, because every test that stores a logo mocks the storage
  // module. It is here so this mock stays a faithful mirror of what the real module
  // requires at boot.
  // Already split, because the real module reads the app id out of the base64 token
  // before anything reads it.
  UPLOADTHING_TOKEN: { token: "test-uploadthing-token", appId: "testapp" },
  // Already a boolean, like X_DRY_RUN. Off, so every market test serves a null dollar
  // rate unless it mocks the rates it wants.
  DOLLAR_RATES: false,
  DOLLAR_RATE_RPC_URL: "http://localhost:8545",
  DOLLAR_RATE_CHAIN_ID: 46630,
  // Already merged, because the real module folds NATIVE_USD_FEED in under the zero
  // address. Native ETH and one ERC-20, each priced by its own feed, so a test sees a
  // list that trades against more than one quote asset.
  DOLLAR_RATE_FEEDS: {
    "0x0000000000000000000000000000000000000000":
      "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9",
    "0x0ae6ab900fc7f3be5bd9f5137827fa99200373f7":
      "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
  },
  LOG_LEVEL: "debug",
};
