import { formatDollars } from '@/shared/lib';

/** Stands in for a dollar amount there is nothing to value yet. */
const PENDING = '–';

/**
 * What an amount on the trade card is worth in dollars, e.g. `$564.15`. `pairPerUnit` is one
 * unit's price in the Paired asset: one for the Paired asset itself, the chain price for the token,
 * or `null` while that price is unread. A dash with nothing to value, and `null`, no line at all,
 * without a Dollar rate: the card then reads in the Paired asset alone, as everything else does.
 */
export function dollarLine(
  amount: number,
  { pairPerUnit, rate }: { pairPerUnit: number | null; rate: number | null },
): string | null {
  if (rate === null) return null;
  if (!(amount > 0) || pairPerUnit === null) return PENDING;
  return formatDollars(amount * pairPerUnit * rate);
}
