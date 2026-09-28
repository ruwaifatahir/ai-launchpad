import { defineConfig } from "vitest/config";

// A fixed deployment for the tests, so they never read a developer's .env: the launchpad
// on Robinhood Chain testnet (chain 46630). No test calls its RPC.
export default defineConfig({
  test: {
    env: {
      CHAIN_ID: "46630",
      RPC_URL: "http://127.0.0.1:8545",
      START_BLOCK: "123983012",
      FACTORY_ADDRESS: "0xFb51A8b33eF1B280ECAC995C7b2a4237EFC21DeC",
      HOOK_ADDRESS: "0x6Bb597c89cD74147412833dDE425D600AD63e044",
      BUYBACK_VAULT_ADDRESS: "0x1642c6c8Bdcb418e8CA1645ec625527ECdaDe8DA",
      LOCKER_ADDRESS: "0xe11110818B36Cd568dC8A74990D6630764B09bcF",
      POOL_MANAGER_ADDRESS: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    },
  },
});
