import { formatUnits } from 'viem';

const wholeAmount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const smallAmount = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 });
const tradeFraction = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
const compactAmount = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
/** From this many zeros after the decimal point, the run is written as a subscript count. */
const MIN_ZEROS_TO_COMPRESS = 4;

/**
 * An amount of the Paired asset, such as a price or market cap: `18.6789` → `18.68`,
 * `0.000307149` → `0.0003071`, `0.0000000186789` → `0.0₇1868`. Two decimals from 1 up, four
 * significant digits below, and a long run of leading zeros counted in subscript so a tiny price
 * fits its stat cell.
 */
export function formatPairAmount(value: number): string {
  if (value >= 1) return wholeAmount.format(value);
  const formatted = smallAmount.format(value);
  const match = /^0\.(0+)(\d+)$/.exec(formatted);
  if (!match || match[1]!.length < MIN_ZEROS_TO_COMPRESS) return formatted;
  const count = [...String(match[1]!.length)].map((digit) => SUBSCRIPT_DIGITS[Number(digit)]).join('');
  return `0.0${count}${match[2]}`;
}

/**
 * An amount in the trade card: `18.6789` → `18.68`, `0.19879` → `0.19879`, and anything under
 * 0.0000005 rounds to `0`, as on Pons. Unlike a price, a trade amount that small is worth nothing.
 */
export function formatTradeAmount(value: number): string {
  return value >= 1 ? wholeAmount.format(value) : tradeFraction.format(value);
}

/** An amount written short: `1890` → `1.89K`, `36.14` → `36.14`, and a fraction as {@link formatPairAmount}. */
export function formatCompactAmount(value: number): string {
  return value >= 1 ? compactAmount.format(value) : formatPairAmount(value);
}

/** A raw integer amount from the backend, in whole units of its `decimals`. */
export function fromRawAmount(raw: string, decimals: number): number {
  return Number(formatUnits(BigInt(raw), decimals));
}

/** A dollar amount written as a Paired-asset amount is, with its sign: `$65,611,037.77`, `$0.06906`. */
export function formatDollars(value: number): string {
  return `$${formatPairAmount(value)}`;
}

/** A dollar amount written short, as a card figure: `$673.98M`, `$6.77K`, `$36.14`. */
export function formatCompactDollars(value: number): string {
  return `$${formatCompactAmount(value)}`;
}
