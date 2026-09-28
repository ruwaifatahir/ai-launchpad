import type { Context } from "ponder:registry";
import { type Address, erc20Abi, zeroAddress } from "viem";

// The curve treats a zero quote asset as native ETH, which has no contract to read.
const nativeEth = { symbol: "ETH", decimals: 18 };

// A quote asset's symbol and decimals. They are read at the latest block and cached, as
// `cache: "immutable"` does: a token's symbol and decimals never change. A read that
// fails throws, so a quote asset that is not a plain ERC-20 stops indexing loudly.
export async function readQuoteAsset(
  client: Pick<Context["client"], "readContract">,
  quoteAsset: Address,
) {
  if (quoteAsset === zeroAddress) return nativeEth;
  const quoteAssetRead = {
    abi: erc20Abi,
    address: quoteAsset,
    cache: "immutable",
  } as const;
  const [symbol, decimals] = await Promise.all([
    client.readContract({ ...quoteAssetRead, functionName: "symbol" }),
    client.readContract({ ...quoteAssetRead, functionName: "decimals" }),
  ]);
  return { symbol, decimals };
}
