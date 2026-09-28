/** The ranges the chart route serves, in the order the range tabs show them. */
export const CHART_RANGES = ['5m', '1h', '6h', '1d', 'all'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

/** All time, so the first view of any token shows its whole history rather than a possibly empty hour. */
export const DEFAULT_CHART_RANGE: ChartRange = 'all';
