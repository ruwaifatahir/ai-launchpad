/** A Paired asset some token trades against, as `GET /api/v1/market/quote-assets` sends it. */
export type ApiPairedAsset = {
  /** Lowercase address. The zero address is native ETH. */
  address: string;
  symbol: string;
  decimals: number;
};

/** One token as every list route sends it. Amounts are raw integers, in its Paired asset's decimals (`quoteAsset` on the wire). */
export type ApiListedToken = {
  /** Lowercase address. */
  token: string;
  name: string;
  symbol: string;
  /** A link to the logo, or empty. */
  logo: string;
  /** The Creator. Lowercase address. */
  creator: string;
  marketCap: string;
  quoteAsset: ApiPairedAsset;
  /** The Paired asset's Dollar rate: dollars per whole unit, or `null` when the API has none. */
  quoteUsd: number | null;
  /** Toward graduation, from 0 to 100; 100 once graduated. */
  progress: number;
  graduated: boolean;
  /** Unix seconds. */
  launchedAt: number;
  /** Unix seconds, or `null` before the first buy. */
  lastBuyAt: number | null;
  /** The volume over the age's window. Only under the Volume sort. */
  volume?: string;
};
