import type { Address } from "viem";
import { zeroAddress } from "viem";
import { describe, expect, it, vi } from "vitest";

import { readQuoteAsset } from "../src/quote-asset";

// The stock token every testnet launch so far is quoted in.
const nvda: Address = "0x0ae6ab900fc7f3be5bd9f5137827fa99200373f7";

// A client whose ERC-20 reads answer like NVDA's contract, or fail for `failing`. viem
// types readContract per ABI and function, which a fake cannot match, hence the cast.
function nvdaClient({ failing }: { failing?: "symbol" } = {}) {
  const readContract = vi.fn(({ functionName }: { functionName: string }) =>
    functionName === failing
      ? Promise.reject(new Error("execution reverted"))
      : Promise.resolve(functionName === "symbol" ? "NVDA" : 18),
  );
  const client = { readContract } as unknown as Parameters<typeof readQuoteAsset>[0];
  return { client, readContract };
}

describe("readQuoteAsset", () => {
  it("reads an ERC-20 quote asset's symbol and decimals from its contract", async () => {
    const { client, readContract } = nvdaClient();

    await expect(readQuoteAsset(client, nvda)).resolves.toEqual({
      symbol: "NVDA",
      decimals: 18,
    });
    for (const [call] of readContract.mock.calls) {
      expect(call).toMatchObject({ address: nvda, cache: "immutable" });
    }
  });

  // Native ETH has no contract to read.
  it("names native ETH without reading the chain", async () => {
    const { client, readContract } = nvdaClient();

    await expect(readQuoteAsset(client, zeroAddress)).resolves.toEqual({
      symbol: "ETH",
      decimals: 18,
    });
    expect(readContract).not.toHaveBeenCalled();
  });

  it("fails when the quote asset's symbol cannot be read", async () => {
    const { client } = nvdaClient({ failing: "symbol" });

    await expect(readQuoteAsset(client, nvda)).rejects.toThrow("execution reverted");
  });
});
