/** `0xAa07A0e9…6eF3128A3` → `0xAa07…28A3`, the short form used across the UI. */
export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
