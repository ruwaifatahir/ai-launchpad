import { cx } from '@/shared/lib';
import { NO_FIGURE, type DailyPoint } from '../model/analytics';
import { CHART, layoutBars } from '../lib/bar-layout';

type DailyBarChartProps = {
  title: string;
  points: DailyPoint[];
  formatValue: (value: number) => string;
  /** Appended to each bar's accessible label, e.g. " launches". */
  valueSuffix?: string;
};

/** Daily history as bars, with the latest completed day highlighted and its value as the headline total. */
export function DailyBarChart({ title, points, formatValue, valueSuffix = '' }: DailyBarChartProps) {
  const bars = layoutBars(points.map((point) => point.value));
  const lastIndex = points.length - 1;
  const latest = points[lastIndex];
  // First, middle and last day, each once, so a short series does not repeat a date.
  const axisIndexes = lastIndex < 0 ? [] : [...new Set([0, Math.floor(lastIndex / 2), lastIndex])];

  return (
    <section className="analytics-chart-card">
      <header className="analytics-chart-header">
        <div className="analytics-chart-title-row">
          <h2>{title}</h2>
          <strong className="analytics-chart-total">
            {latest?.value == null ? NO_FIGURE : formatValue(latest.value)}
          </strong>
        </div>
      </header>
      <div className="analytics-chart-stage">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-label={`${title} daily history`}
          preserveAspectRatio="none"
        >
          <line
            className="analytics-chart-baseline"
            x1={CHART.paddingX}
            x2={CHART.width - CHART.paddingX}
            y1={CHART.baselineY}
            y2={CHART.baselineY}
          />
          <g className="analytics-chart-bars">
            {points.map((point, index) => {
              const bar = bars[index];
              if (!bar) return null;
              return (
                <rect
                  key={point.day}
                  className={cx(index === lastIndex && 'is-active', bar.missing && 'is-missing')}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  tabIndex={0}
                  aria-label={
                    point.value === null
                      ? `${point.date}, no figure yet`
                      : `${point.date}, ${formatValue(point.value)}${valueSuffix}`
                  }
                />
              );
            })}
          </g>
        </svg>
        <div className="analytics-chart-axis" aria-hidden="true">
          {axisIndexes.map((index) => (
            <span key={index}>{points[index]!.date}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
