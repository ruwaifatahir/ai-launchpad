import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import dotenv from "dotenv";

dotenv.config();

// Robinhood Chain mainnet. The public RPC is NOT an archive node (~9 minutes of
// state retention), so pinned-block forking requires the archive endpoint.
const FORK_RPC_URL = process.env.FORK_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const RH_RPC_URL = process.env.RH_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const FORK_BLOCK = process.env.FORK_BLOCK_NUMBER ? BigInt(process.env.FORK_BLOCK_NUMBER) : undefined;
// Robinhood Chain testnet. Uniswap V4, Permit2 and the CREATE2 deployer sit at
// the same addresses as mainnet, so config/pons.ts EXTERNAL applies unchanged.
const RH_TESTNET_RPC_URL = process.env.RH_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com/rpc";

// The `target` network: any EVM chain with Uniswap V4 and the CREATE2 deployer.
// The URL and key are configuration variables, resolved only when `target` is
// used, so every other command runs without them.
const TARGET_CHAIN_ID = process.env.TARGET_CHAIN_ID ? Number(process.env.TARGET_CHAIN_ID) : undefined;

// Verification on `target`. Chains Etherscan already knows need only
// ETHERSCAN_API_KEY. Any other chain names its explorer here, as either an
// Etherscan-compatible or a Blockscout API.
const TARGET_EXPLORER = process.env.TARGET_EXPLORER as "etherscan" | "blockscout" | undefined;
const targetExplorer =
  TARGET_EXPLORER && process.env.TARGET_EXPLORER_URL && process.env.TARGET_EXPLORER_API_URL
    ? {
        [TARGET_EXPLORER]: {
          name: `${TARGET_EXPLORER} for chain ${TARGET_CHAIN_ID}`,
          url: process.env.TARGET_EXPLORER_URL,
          apiUrl: process.env.TARGET_EXPLORER_API_URL,
        },
      }
    : undefined;

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],

  // Compiler settings are copied verbatim from the verified on-chain metadata of
  // PonsV2LaunchFactory (0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e). Changing any
  // of these pushes the factory over the EIP-170 24,576-byte limit.
  solidity: {
    profiles: {
      default: {
        version: "0.8.35",
        settings: {
          viaIR: true,
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun",
          metadata: { appendCBOR: true, bytecodeHash: "ipfs", useLiteralContent: false },
        },
      },
      production: {
        version: "0.8.35",
        settings: {
          viaIR: true,
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun",
          metadata: { appendCBOR: true, bytecodeHash: "ipfs", useLiteralContent: false },
        },
      },
    },
  },

  networks: {
    // The chain being deployed to. Hardhat checks TARGET_CHAIN_ID against the
    // RPC, so a URL for the wrong chain fails before any transaction is signed.
    target: {
      type: "http",
      chainType: "generic",
      ...(TARGET_CHAIN_ID !== undefined ? { chainId: TARGET_CHAIN_ID } : {}),
      url: configVariable("TARGET_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    // The networks below exist to check this copy against the live Pons
    // deployment on Robinhood Chain: the parity check, the fork rehearsal and
    // the scenarios all run against them.
    //
    // Pinned fork of Robinhood Chain mainnet for the deployment rehearsal.
    ponsFork: {
      type: "edr-simulated",
      chainType: "generic",
      chainId: 4663,
      allowUnlimitedContractSize: false,
      forking: {
        url: FORK_RPC_URL,
        ...(FORK_BLOCK !== undefined ? { blockNumber: FORK_BLOCK } : {}),
      },
    },
    // Live Robinhood Chain mainnet.
    ponsMainnet: {
      type: "http",
      chainType: "generic",
      chainId: 4663,
      url: RH_RPC_URL,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [configVariable("DEPLOYER_PRIVATE_KEY")] : [],
    },
    // Fork of Robinhood Chain testnet at head, for exercising our deployed
    // contracts (PONS_DEPLOYMENT=...) without spending testnet gas.
    ponsTestnetFork: {
      type: "edr-simulated",
      chainType: "generic",
      chainId: 46630,
      allowUnlimitedContractSize: false,
      forking: { url: RH_TESTNET_RPC_URL },
    },
    // Live Robinhood Chain testnet.
    ponsTestnet: {
      type: "http",
      chainType: "generic",
      chainId: 46630,
      url: RH_TESTNET_RPC_URL,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [configVariable("DEPLOYER_PRIVATE_KEY")] : [],
    },
  },

  chainDescriptors: {
    4663: {
      name: "Robinhood Chain",
      // Lets ponsFork answer calls at the fork block itself, which the deploy
      // pre-flight makes before any block has been mined on the fork.
      hardforkHistory: { cancun: { blockNumber: 0 } },
      blockExplorers: {
        blockscout: {
          name: "Robinhood Chain Blockscout",
          url: "https://robinhoodchain.blockscout.com",
          apiUrl: "https://robinhoodchain.blockscout.com/api",
        },
      },
    },
    46630: {
      name: "Robinhood Chain Testnet",
      // Lets ponsTestnetFork answer queries at the fork block itself.
      hardforkHistory: { cancun: { blockNumber: 0 } },
    },
    ...(TARGET_CHAIN_ID !== undefined && targetExplorer && TARGET_CHAIN_ID !== 4663 && TARGET_CHAIN_ID !== 46630
      ? { [TARGET_CHAIN_ID]: { name: `Chain ${TARGET_CHAIN_ID}`, blockExplorers: targetExplorer } }
      : {}),
  },

  ...(process.env.ETHERSCAN_API_KEY ? { verify: { etherscan: { apiKey: configVariable("ETHERSCAN_API_KEY") } } } : {}),
});
