import { createPublicClient, defineChain, formatUnits, http } from "viem";
import type { Address } from "viem";
import { env } from "@/config/env";

// The chain the feeds live on, DOLLAR_RATE_RPC_URL and DOLLAR_RATE_CHAIN_ID, which fall
// back to the app's own chain. A deployment on a testnet can point them at its mainnet,
// so its quote assets are still priced by the real assets they stand in for.
//
// Built on the first read rather than at import, so nothing connects while dollar rates
// are off and nothing reads a feed.
//
// A dollar rate is shown, never settled, so a slow node is given up on rather than
// waited for or asked twice. The read fails fast and the caller goes without the rate.
let client: ReturnType<typeof connect> | undefined;

const connect = () =>
  createPublicClient({
    chain: defineChain({
      id: env.DOLLAR_RATE_CHAIN_ID,
      name: "dollar-rates",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [env.DOLLAR_RATE_RPC_URL] } },
    }),
    transport: http(env.DOLLAR_RATE_RPC_URL, { timeout: 3_000, retryCount: 0 }),
  });

// latestRoundData and getRoundData answer the same five values.
const roundOutputs = [
  { name: "roundId", type: "uint80" },
  { name: "answer", type: "int256" },
  { name: "startedAt", type: "uint256" },
  { name: "updatedAt", type: "uint256" },
  { name: "answeredInRound", type: "uint80" },
] as const;

// The reads the app takes from Chainlink's AggregatorV3Interface.
const feedAbi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: roundOutputs,
  },
  {
    type: "function",
    name: "getRoundData",
    stateMutability: "view",
    inputs: [{ name: "_roundId", type: "uint80" }],
    outputs: roundOutputs,
  },
] as const;

// The feed's latest answer in whole dollars. Its age is not checked: a stock feed stands
// still outside market hours, and its last answer is still the one to show. An answer at
// or below zero is no price at all, so it throws like a failed read does.
export const readFeed = async (feed: Address): Promise<number> => {
  client ??= connect();

  const [decimals, [, answer]] = await Promise.all([
    client.readContract({ address: feed, abi: feedAbi, functionName: "decimals" }),
    client.readContract({ address: feed, abi: feedAbi, functionName: "latestRoundData" }),
  ]);

  if (answer <= 0n) throw new Error(`The feed at ${feed} answered ${answer}.`);

  return Number(formatUnits(answer, decimals));
};

// One round of a feed. The id is the proxy's, with the phase in its top bits. The answer
// is raw, in the feed's decimals, and unchecked: the caller decides what one at or below
// zero means. updatedAt is in unix seconds.
export interface Round {
  roundId: bigint;
  answer: bigint;
  updatedAt: number;
}

// The proxy numbers a round as its phase shifted 64 bits up, plus the round's number
// inside that phase, which counts from 1.
const IN_PHASE = (1n << 64n) - 1n;

const readRound = async (feed: Address, roundId: bigint): Promise<Round> => {
  client ??= connect();

  const [, answer, , updatedAt] = await client.readContract({
    address: feed,
    abi: feedAbi,
    functionName: "getRoundData",
    args: [roundId],
  });

  // A round with no update time never finished. Every round searched here has, so one
  // without is a feed this code does not understand, and the search is refused.
  if (updatedAt === 0n) throw new Error(`The feed at ${feed} has no round ${roundId}.`);

  return { roundId, answer, updatedAt: Number(updatedAt) };
};

// A feed's past, for finding the answer it stood at when some moment passed. Reads the
// feed's decimals, its latest round and its current phase's first round up front.
//
// closingRound(close) is the last round the feed updated before close, a unix second,
// or null when its first round came at or after it. It binary searches the rounds by
// update time, which only rises from one round to the next, so a close costs about
// log2 of the feed's rounds in reads. Closes asked for oldest first start each search
// from the round the one before found.
//
// Only the current phase is searched, so after a phase change a close before the new
// phase's first round finds nothing. A feed still in its first phase holds every round
// it ever answered there.
export const readFeedHistory = async (feed: Address) => {
  client ??= connect();

  const [decimals, [latestId, latestAnswer, , latestUpdatedAt]] = await Promise.all([
    client.readContract({ address: feed, abi: feedAbi, functionName: "decimals" }),
    client.readContract({ address: feed, abi: feedAbi, functionName: "latestRoundData" }),
  ]);

  const latest: Round = {
    roundId: latestId,
    answer: latestAnswer,
    updatedAt: Number(latestUpdatedAt),
  };
  const first = await readRound(feed, (latestId & ~IN_PHASE) | 1n);

  // The round the last search found, and the close it was found for.
  let floor = first;
  let floorClose = 0;

  const closingRound = async (close: number): Promise<Round | null> => {
    if (first.updatedAt >= close) return null;
    if (latest.updatedAt < close) return latest;

    // below always updated before close and above at or after it, so once they are
    // neighbours below is the answer.
    let below = close >= floorClose ? floor : first;
    let above = latest;

    while (above.roundId - below.roundId > 1n) {
      const middle = await readRound(feed, (below.roundId + above.roundId) / 2n);

      if (middle.updatedAt < close) below = middle;
      else above = middle;
    }

    floor = below;
    floorClose = close;

    return below;
  };

  return { decimals, closingRound };
};
