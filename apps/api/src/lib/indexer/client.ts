import pg from "pg";
import type { QueryResultRow } from "pg";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

// The indexer's database, read with plain SQL rather than Prisma, because its schema is Ponder's. The
// indexer owns every table in it, so nothing here writes, and nothing read here is
// copied into the backend's own database: a chain reorg can rewrite recent rows.
//
// Every query names the indexer schema itself. Ponder points the views there at the
// live deploy, and the indexer_<sha> schemas beside it stop updating once a newer
// deploy takes over, so no query may name one.
//
// The reads come in three lanes, each with its own pool. token-page is a token's
// trades, chart and holders, which the Panel polls on every open token page. lists is
// the token lists, search and quote assets, whose free text and pages mostly miss the
// cache. agents is the graduation read behind the agent, its previews and its
// connection, one indexed row per request. A burst of searches can fill the lists
// pool, but never takes a connection a token page or a creator needs.
//
// Twelve connections between the three. The usual sizing is twice the database's
// cores, and the indexer's server has four. Ponder takes up to 29 of the 97 its
// Postgres allows, so twelve leave room even while a redeploy runs two indexers at once.
const LANE_SIZES = { "token-page": 4, lists: 6, agents: 2 } as const;

export type IndexerLane = keyof typeof LANE_SIZES;

// The timeouts keep a slow or dead indexer from holding a request open. Two seconds
// to connect and five to answer are far past what a healthy read takes, and short
// enough that a caller gets a 503 rather than a hung page.
const openPool = (lane: IndexerLane) => {
  const pool = new pg.Pool({
    connectionString: env.INDEXER_DATABASE_URL,
    max: LANE_SIZES[lane],
    connectionTimeoutMillis: 2_000,
    statement_timeout: 5_000,
    query_timeout: 6_000,
    application_name: `ai-launchpad-api:${lane}`,
  });

  // An idle client whose connection drops emits this on the pool. Without a listener
  // Node treats it as uncaught and the whole process shuts down over one lost socket.
  pool.on("error", (error) => {
    logger.warn("an idle indexer connection failed", { lane, error: error.message });
  });

  return pool;
};

const pools: Record<IndexerLane, pg.Pool> = {
  "token-page": openPool("token-page"),
  lists: openPool("lists"),
  agents: openPool("agents"),
};

// Closes every pool, on shutdown.
export const endIndexer = async () => {
  await Promise.all(Object.values(pools).map((pool) => pool.end()));
};

// How many reads may queue for a connection, per connection in the pool. Past it a
// read is refused at once, rather than waiting two seconds for a connection it would
// most likely not get.
const QUEUE_PER_CONNECTION = 2;

const host = new URL(env.INDEXER_DATABASE_URL).host;

// Every connection in a lane was taken and the read could not wait for one. The
// indexer is answering: this backend is reading it as fast as the lane allows.
// Carries no status, as IndexerUnreachableError does not.
export class IndexerBusyError extends Error {
  constructor(lane: IndexerLane) {
    super(`Every ${lane} connection to the indexer is taken.`);
    this.name = "IndexerBusyError";
  }
}

// What pg-pool throws, with no code, when a read waited its connectionTimeoutMillis
// for a connection in a full pool. A connection that could not be opened throws
// "Connection terminated due to connection timeout" instead, which is an outage.
const POOL_WAIT_TIMEOUT = /^timeout exceeded when trying to connect$/;

// The indexer did not answer. Carries no status: src/shared/middleware/error-handler.ts
// is where a failure becomes a response. Names the host and never the URL, which holds
// the password.
export class IndexerUnreachableError extends Error {
  constructor(cause: unknown) {
    super(`The indexer database at ${host} could not be read.`, { cause });
    this.name = "IndexerUnreachableError";
  }
}

const SQLSTATE = /^[0-9A-Z]{5}$/;

// SQLSTATE classes that mean the server could not serve us right now: 08 a broken
// connection, 53 out of resources, 57 shut down or the statement timed out.
const UNREACHABLE_CLASSES = new Set(["08", "53", "57"]);

// 08P01 sits in the connection class but is a protocol violation, which a server
// answers for a query we sent wrong, such as one with fewer values than placeholders.
const OUR_PROTOCOL_VIOLATION = "08P01";

// The socket errors Node raises when the server cannot be reached at all.
const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
]);

// What pg and its pool throw, with no code, when a connection could not be made or was
// lost mid query. pg gives these no code, so the message is all there is to match.
const DRIVER_OUTAGES = [
  /^Connection terminated/,
  /^Query read timeout$/,
  /^timeout expired$/,
  /^Client has encountered a connection error/,
];

// A failure with a SQLSTATE came from a server that answered. Only the classes above
// are an outage; anything else, such as a renamed column or a refused grant, is ours
// to fix and stays a 500. Without a SQLSTATE, only a known network or driver failure
// is an outage. Anything else, such as a value pg could not serialize, is a bug of
// ours and stays a 500 too.
const isUnreachable = (error: unknown) => {
  if (!(error instanceof Error)) return false;

  const code = (error as { code?: unknown }).code;

  if (typeof code === "string" && SQLSTATE.test(code))
    return code !== OUR_PROTOCOL_VIOLATION && UNREACHABLE_CLASSES.has(code.slice(0, 2));

  if (typeof code === "string") return NETWORK_CODES.has(code);

  return DRIVER_OUTAGES.some((pattern) => pattern.test(error.message));
};

const isPoolWaitTimeout = (error: unknown) =>
  error instanceof Error && POOL_WAIT_TIMEOUT.test(error.message);

// The one way a repo reads the indexer, in the lane its route belongs to. Numeric
// columns come back as strings, which is what keeps raw token amounts exact.
export const readIndexer = async <Row extends QueryResultRow>(
  lane: IndexerLane,
  text: string,
  values: unknown[],
): Promise<Row[]> => {
  const pool = pools[lane];

  if (pool.waitingCount >= LANE_SIZES[lane] * QUEUE_PER_CONNECTION)
    throw new IndexerBusyError(lane);

  try {
    const result = await pool.query<Row>(text, values);
    return result.rows;
  } catch (error) {
    if (isPoolWaitTimeout(error)) throw new IndexerBusyError(lane);
    if (isUnreachable(error)) throw new IndexerUnreachableError(error);
    throw error;
  }
};
