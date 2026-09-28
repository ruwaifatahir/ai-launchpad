// Chart geometry in SVG user units. The SVG stretches to its container (preserveAspectRatio="none").
export const CHART = {
  width: 720,
  height: 190,
  paddingX: 8,
  baselineY: 182,
  maxBarHeight: 170,
  /** Share of each day's slot taken by its bar; the rest is the gap between bars. */
  barRatio: 0.52,
  /** Height of the marker drawn for a day with no figure, so it reads as missing rather than zero. */
  missingHeight: 6,
} as const;

export type Bar = { x: number; y: number; width: number; height: number; missing: boolean };

/** Lays out one bar per value, scaled so the largest value fills `maxBarHeight`. A `null` gets a missing marker. */
export function layoutBars(values: (number | null)[]): Bar[] {
  let max = 0;
  for (const value of values) if (value !== null && value > max) max = value;

  const slot = (CHART.width - CHART.paddingX * 2) / values.length;
  const width = slot * CHART.barRatio;
  const inset = (slot - width) / 2;

  return values.map((value, index) => {
    const x = CHART.paddingX + index * slot + inset;
    if (value === null) {
      return { x, y: CHART.baselineY - CHART.missingHeight, width, height: CHART.missingHeight, missing: true };
    }
    const height = max === 0 ? 0 : (value / max) * CHART.maxBarHeight;
    return { x, y: CHART.baselineY - height, width, height, missing: false };
  });
}
