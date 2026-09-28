const SMALLEST_SHOWN = 0.0001;
const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

/** `"0.421337891"`, `"ETH"` → `0.4213 ETH`. Dust shows as `<0.0001 ETH` rather than a misleading `0`. */
export function formatBalance(formatted: string, symbol: string): string {
  const value = Number(formatted);
  if (value > 0 && value < SMALLEST_SHOWN) return `<${SMALLEST_SHOWN} ${symbol}`;
  return `${amount.format(value)} ${symbol}`;
}
