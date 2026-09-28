import { beforeEach, describe, expect, it, vi } from "vitest";

const { readContract } = vi.hoisted(() => ({ readContract: vi.fn() }));

vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: vi.fn(() => ({ readContract })),
}));

import { readFeed, readFeedHistory } from "@/lib/chainlink/client";

const feed = "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15" as const;

// latestRoundData as viem decodes it: roundId, answer, startedAt, updatedAt,
// answeredInRound. Only the answer is read.
const round = (answer: bigint) => [1n, answer, 1790000000n, 1790000000n, 1n];

const answering = (answer: bigint, decimals = 8) =>
  readContract.mockImplementation(async (call: { functionName: string }) =>
    call.functionName === "decimals" ? decimals : round(answer),
  );

describe("readFeed", () => {
  beforeEach(() => {
    readContract.mockReset();
  });

  it("reads the latest answer in whole dollars, at the feed's own decimals", async () => {
    answering(22566000000n);

    await expect(readFeed(feed)).resolves.toBe(225.66);
  });

  it("scales by whatever decimals the feed reports", async () => {
    answering(2691_000000000000000000n, 18);

    await expect(readFeed(feed)).resolves.toBe(2691);
  });

  it("reads the feed at the address it is given", async () => {
    answering(22566000000n);

    await readFeed(feed);

    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ address: feed }));
  });

  it.each([
    ["zero", 0n],
    ["negative", -1n],
  ])("refuses a %s answer, which no dollar rate can be", async (_label, answer) => {
    answering(answer);

    await expect(readFeed(feed)).rejects.toThrow(/answered/);
  });

  it("passes a failed read on, for the caller to decide what no rate means", async () => {
    readContract.mockRejectedValue(new Error("node down"));

    await expect(readFeed(feed)).rejects.toThrow("node down");
  });
});

describe("readFeedHistory", () => {
  // A feed in phase 3, so a search that forgot the phase would ask for rounds that do not
  // exist. Its rounds update at 100, 200, 300 and 400, answering 1 to 4.
  const PHASE = 3n << 64n;
  const updates = [100, 200, 300, 400];

  const round = (index: number, updatedAt = updates[index]) => {
    const id = PHASE + BigInt(index + 1);
    return [id, BigInt(index + 1), BigInt(updatedAt), BigInt(updatedAt), id];
  };

  const serving = (gap?: number) =>
    readContract.mockImplementation(
      async (call: { functionName: string; args?: [bigint] }) => {
        if (call.functionName === "decimals") return 8;
        if (call.functionName === "latestRoundData") return round(updates.length - 1);

        const index = Number(call.args![0] - PHASE) - 1;
        if (index < 0 || index >= updates.length) throw new Error("No data present");
        return round(index, index === gap ? 0 : undefined);
      },
    );

  beforeEach(() => {
    readContract.mockReset();
  });

  it("serves the feed's decimals", async () => {
    serving();

    expect((await readFeedHistory(feed)).decimals).toBe(8);
  });

  it("finds the last round updated before the close, within the current phase", async () => {
    serving();
    const history = await readFeedHistory(feed);

    await expect(history.closingRound(250)).resolves.toEqual({
      roundId: PHASE + 2n,
      answer: 2n,
      updatedAt: 200,
    });
  });

  it("leaves a round updated at the close itself to the next close", async () => {
    serving();
    const history = await readFeedHistory(feed);

    expect((await history.closingRound(300))?.roundId).toBe(PHASE + 2n);
  });

  it("finds nothing before the phase's first round", async () => {
    serving();
    const history = await readFeedHistory(feed);

    await expect(history.closingRound(100)).resolves.toBeNull();
  });

  it("takes the latest round for a close after the feed last moved", async () => {
    serving();
    const history = await readFeedHistory(feed);

    expect((await history.closingRound(10_000))?.roundId).toBe(PHASE + 4n);
  });

  it("still finds an earlier close after a later one", async () => {
    serving();
    const history = await readFeedHistory(feed);

    await history.closingRound(350);

    expect((await history.closingRound(150))?.roundId).toBe(PHASE + 1n);
  });

  it("refuses a round with no update time, which it cannot place", async () => {
    serving(1);
    const history = await readFeedHistory(feed);

    await expect(history.closingRound(250)).rejects.toThrow(/no round/);
  });
});
