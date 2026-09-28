import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { marketChartQuery, type ChartResponse } from '../api/market-chart';
import { DEFAULT_CHART_RANGE } from '../config/chart-ranges';

const rateOf = (chart: ChartResponse) => chart.quoteUsd;

/**
 * The Dollar rate of a token's Paired asset, which the chart route sends beside the chart. The
 * stats row and the trade card read the chain, so this is the one API answer they take it from:
 * the default range's chart, shared with the market card while it shows that range. `null` until
 * the route answers, when it sends no rate, and when it fails; every figure then stays in the
 * Paired asset.
 */
export function useDollarRate(token: Address): number | null {
  const { data } = useQuery({ ...marketChartQuery(token, DEFAULT_CHART_RANGE), select: rateOf });
  return data ?? null;
}
