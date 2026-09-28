import {
  BaseError,
  ContractFunctionZeroDataError,
  HttpRequestError,
  InternalRpcError,
  LimitExceededRpcError,
  ResourceUnavailableRpcError,
  TimeoutError,
  createPublicClient,
  defineChain,
  http,
} from "viem";
import type { Address } from "viem";
import { env } from "@/config/env";

// The chain is built from env rather than picked from a viem preset, so any EVM
// chain works whether or not viem ships a preset for it. Only the fields the
// transport and the signature check read are set.
const chain = defineChain({
  id: env.CHAIN_ID,
  name: `chain-${env.CHAIN_ID}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [env.RPC_URL] } },
});

export const publicClient = createPublicClient({
  chain,
  transport: http(env.RPC_URL),
});

// What can go wrong reading the chain, named here rather than guessed at by each
// caller. Neither one carries a status or a sentence for a caller to read: nothing
// in this module knows about HTTP, and src/shared/middleware/error-handler.ts is
// where a failure becomes a response.
//
// A dead node and a wrong factory address are separate on purpose. One is worth
// retrying and the other is ours to fix, and calling them both an outage sends an
// operator to restart a node that was never down.
//
// Each message names what an operator would otherwise have to go and look up. The
// host is named rather than the full RPC URL, because a provider puts its key in
// the path and a log is not the place for it.
const node = new URL(env.RPC_URL).host;

export class ChainUnreachableError extends Error {
  constructor(cause: unknown) {
    super(`Chain ${env.CHAIN_ID} could not be read at ${node}.`, { cause });
    this.name = "ChainUnreachableError";
  }
}

export class ChainMisconfiguredError extends Error {
  constructor(cause: unknown) {
    super(
      `The factory at ${env.FACTORY_ADDRESS} could not be read in full on chain ${env.CHAIN_ID}. Check FACTORY_ADDRESS and RPC_URL.`,
      { cause },
    );
    this.name = "ChainMisconfiguredError";
  }
}

// The one read the app takes from the Pons V2 launch factory, which holds every token
// whatever it trades against. A token it never launched is not a revert: the record
// comes back with every field zero and exists false. Graduation is not read here: the
// indexer already follows every pool, so it is read from there.
const factoryAbi = [
  {
    type: "function",
    name: "getLaunchedToken",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "curve", type: "address" },
          { name: "deployer", type: "address" },
          { name: "creatorFeeRecipient", type: "address" },
          { name: "pairToken", type: "address" },
          { name: "graduationThreshold", type: "uint256" },
          { name: "poolFee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "creatorTaxBps", type: "uint16" },
          { name: "buybackEnabled", type: "bool" },
          { name: "phase", type: "uint8" },
          { name: "sweptQuote", type: "uint256" },
          { name: "sweptTokens", type: "uint256" },
          { name: "sweptAt", type: "uint256" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
] as const;

// A creator is written at launch and never moves, so a hit is cached for the life
// of the process. A miss is never cached: a token the factory does not know yet
// may be launched later.
const creators = new Map<string, Address>();

// readContract hands back a ContractFunctionExecutionError whatever happened, with
// the real fault buried two or three levels down as its cause, so the answer is
// always along the chain rather than at the top of it.
//
// The three node errors below sit with a refused connection because the node
// answered and still would not serve us, which is a wait rather than a mistake.
// Every other RpcError is left alone: the request itself was wrong, and retrying a
// wrong request produces the same answer twice.
const nameFailure = (error: unknown): never => {
  if (error instanceof BaseError) {
    const unreachable = [
      HttpRequestError,
      TimeoutError,
      LimitExceededRpcError,
      ResourceUnavailableRpcError,
      InternalRpcError,
    ];

    if (error.walk((fault) => unreachable.some((kind) => fault instanceof kind)))
      throw new ChainUnreachableError(error);

    if (error.walk((fault) => fault instanceof ContractFunctionZeroDataError))
      throw new ChainMisconfiguredError(error);
  }

  throw error;
};

const readLaunch = (token: Address) =>
  publicClient
    .readContract({
      address: env.FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: "getLaunchedToken",
      args: [token],
    })
    .catch(nameFailure);

// Returns null when the factory holds no launch for this token, which a caller must
// tell apart from the zero address. A failure is one of the two errors above, so an
// unreachable chain is never read as a missing token.
//
// The creator is the deployer, the wallet that launched the token. Never the creator
// fee recipient, which the creator can hand on and the factory owner can override.
export const readTokenCreator = async (token: Address): Promise<Address | null> => {
  const key = token.toLowerCase();
  const cached = creators.get(key);
  if (cached) return cached;

  const launch = await readLaunch(token);

  if (!launch.exists) return null;

  creators.set(key, launch.deployer);
  return launch.deployer;
};
