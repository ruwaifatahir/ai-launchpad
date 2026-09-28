import { beforeEach, describe, expect, it, vi } from "vitest";

// pg is replaced by a pool whose query the test decides, so each failure the driver
// can raise is fed in and what readIndexer names it is checked.
// Every lane shares the one fake, so waiting stands for whichever lane a test reads.
const { query, end, on, listeners, opened, pool } = vi.hoisted(() => {
  const listeners: ((error: Error) => void)[] = [];
  return {
    query: vi.fn(),
    end: vi.fn(),
    on: vi.fn((event: string, listener: (error: Error) => void) => {
      if (event === "error") listeners.push(listener);
    }),
    listeners,
    opened: [] as { max: number; application_name: string }[],
    pool: { waiting: 0 },
  };
});

vi.mock("pg", () => ({
  default: {
    Pool: vi.fn(
      class {
        query = query;
        end = end;
        on = on;
        constructor(options: { max: number; application_name: string }) {
          opened.push(options);
          Object.defineProperty(this, "waitingCount", { get: () => pool.waiting });
        }
      },
    ),
  },
}));

import {
  IndexerBusyError,
  IndexerUnreachableError,
  endIndexer,
  readIndexer,
} from "@/lib/indexer/client";
import { logger } from "@/lib/logger";

const failure = (message: string, code?: string) =>
  Object.assign(new Error(message), code ? { code } : {});

describe("readIndexer", () => {
  it("returns the rows the indexer answered with", async () => {
    query.mockResolvedValue({ rows: [{ total: 4 }] });

    await expect(readIndexer("lists", "SELECT 1", [])).resolves.toEqual([{ total: 4 }]);
  });

  it("passes the values beside the text, so nothing a caller sends is spliced into SQL", async () => {
    query.mockResolvedValue({ rows: [] });

    await readIndexer("lists", "SELECT $1", ["0xabc"]);

    expect(query).toHaveBeenCalledWith("SELECT $1", ["0xabc"]);
  });

  it.each([
    ["a refused connection", failure("connect ECONNREFUSED", "ECONNREFUSED")],
    ["a host that does not resolve", failure("getaddrinfo ENOTFOUND", "ENOTFOUND")],
    ["a lookup that timed out", failure("getaddrinfo EAI_AGAIN", "EAI_AGAIN")],
    ["a reset socket", failure("read ECONNRESET", "ECONNRESET")],
    [
      "a connect timeout inside the pool",
      failure("Connection terminated due to connection timeout"),
    ],
    ["a socket closed mid query", failure("Connection terminated unexpectedly")],
    ["a query that timed out on the client", failure("Query read timeout")],
    ["a broken connection", failure("connection failure", "08006")],
    ["too many connections", failure("too many clients", "53300")],
    ["a statement timeout", failure("canceling statement", "57014")],
    ["a server shutting down", failure("terminating connection", "57P01")],
  ])("names %s as the indexer being unreachable", async (_label, error) => {
    query.mockRejectedValue(error);

    await expect(readIndexer("lists", "SELECT 1", [])).rejects.toBeInstanceOf(
      IndexerUnreachableError,
    );
  });

  it.each([
    ["a renamed column", failure('column "quote_amount" does not exist', "42703")],
    ["a refused grant", failure("permission denied for view trade", "42501")],
    ["a wrong password", failure("password authentication failed", "28P01")],
    [
      "a query sent with the wrong number of values",
      failure(
        "bind message supplies 1 parameters, but prepared statement requires 2",
        "08P01",
      ),
    ],
    [
      "a value pg could not serialize",
      new TypeError("Do not know how to serialize a BigInt"),
    ],
    [
      "a pool used after it ended",
      failure("Cannot use a pool after calling end on the pool"),
    ],
    ["an unknown system error", failure("EACCES: permission denied", "EACCES")],
  ])("leaves %s as it is, because that one is ours to fix", async (_label, error) => {
    query.mockRejectedValue(error);

    await expect(readIndexer("lists", "SELECT 1", [])).rejects.toBe(error);
  });

  it("names the host and never the password in what it throws", () => {
    const error = new IndexerUnreachableError(new Error());

    expect(error.message).toContain("localhost:5432");
    expect(error.message).not.toContain("reader@");
  });
});

describe("a full lane", () => {
  beforeEach(() => {
    pool.waiting = 0;
    query.mockReset();
  });

  it("names a read that waited too long for a connection busy, not unreachable", async () => {
    query.mockRejectedValue(failure("timeout exceeded when trying to connect"));

    await expect(readIndexer("lists", "SELECT 1", [])).rejects.toBeInstanceOf(
      IndexerBusyError,
    );
  });

  it.each([
    ["token-page", 8],
    ["lists", 12],
    ["agents", 4],
  ] as const)(
    "refuses a %s read at once, without queueing, when %i reads already wait",
    async (lane, waiting) => {
      pool.waiting = waiting;

      await expect(readIndexer(lane, "SELECT 1", [])).rejects.toBeInstanceOf(
        IndexerBusyError,
      );
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["token-page", 7],
    ["lists", 11],
    ["agents", 3],
  ] as const)("queues a %s read while %i wait", async (lane, waiting) => {
    pool.waiting = waiting;
    query.mockResolvedValue({ rows: [] });

    await expect(readIndexer(lane, "SELECT 1", [])).resolves.toEqual([]);
  });
});

describe("the indexer pools", () => {
  it("opens a pool per lane, twelve connections between them, each named for its lane", () => {
    expect(opened.map(({ max, application_name }) => [application_name, max])).toEqual([
      ["ai-launchpad-api:token-page", 4],
      ["ai-launchpad-api:lists", 6],
      ["ai-launchpad-api:agents", 2],
    ]);
  });

  it("ends every pool on shutdown", async () => {
    await endIndexer();

    expect(end).toHaveBeenCalledTimes(3);
  });

  it("logs an idle connection that drops rather than letting it end the process", () => {
    expect(listeners).toHaveLength(3);
    listeners[0](new Error("Connection terminated unexpectedly"));

    expect(logger.warn).toHaveBeenCalledWith("an idle indexer connection failed", {
      lane: "token-page",
      error: "Connection terminated unexpectedly",
    });
  });
});
