import { useId, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { CHART_WIDTH, nearestMark, stepMark, type ChartGeometry, type ChartMark } from '../model/market-chart';

/** Gap between the cursor's dot and the tooltip, and between the tooltip and the stage's sides, in CSS pixels. */
const TOOLTIP_GAP = 12;
const TOOLTIP_INSET = 8;

/** Sets the tooltip beside the mark's dot, on its left when the right has no room, level with the plot. */
function placeTooltip(tooltip: HTMLElement, svg: SVGSVGElement, mark: ChartMark, plot: ChartGeometry['plot']) {
  const ctm = svg.getScreenCTM();
  const stage = tooltip.offsetParent;
  if (!ctm || !stage) return;
  const dot = new DOMPoint(mark.x, mark.y).matrixTransform(ctm);
  const bounds = stage.getBoundingClientRect();
  const x = dot.x - bounds.left;
  const y = dot.y - bounds.top;
  const { offsetWidth: width, offsetHeight: height } = tooltip;
  const left = x + TOOLTIP_GAP + width <= bounds.width - TOOLTIP_INSET ? x + TOOLTIP_GAP : x - TOOLTIP_GAP - width;
  const plotTop = new DOMPoint(0, plot.top).matrixTransform(ctm).y - bounds.top;
  const plotBottom = new DOMPoint(0, plot.bottom).matrixTransform(ctm).y - bounds.top;
  const top = Math.max(Math.min(y - height / 2, plotBottom - height), plotTop);
  tooltip.style.transform = `translate(${Math.round(Math.max(left, TOOLTIP_INSET))}px, ${Math.round(top)}px)`;
}

/**
 * The market cap line, read as a slider across its marks by pointer or keyboard, with a tooltip
 * on the mark under the cursor.
 *
 * Render it inside a positioned stage (`.noxa-chart-stage`): the tooltip is placed within that
 * box. It is not wrapped in its own box because the stage's CSS sizes the SVG directly, absolutely
 * on wide screens and in flow on narrow ones.
 */
export function MarketChartPlot({
  chart,
  symbol,
  activeIndex,
  onScrub,
}: {
  chart: ChartGeometry;
  symbol: string;
  /** Index into `chart.marks` of the mark under the cursor, or `null` when nothing is. */
  activeIndex: number | null;
  onScrub: (mark: ChartMark | null) => void;
}) {
  const fillId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { plot, marks } = chart;
  const nowIndex = marks.length - 1;
  const active = activeIndex === null ? null : marks[activeIndex]!;
  // Resting on now until the cursor moves.
  const read = active ?? marks[nowIndex]!;

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const tooltip = tooltipRef.current;
    if (!active || !svg || !tooltip) return;
    const place = () => placeTooltip(tooltip, svg, active, plot);
    place();
    // The chart rescales with the window, so the tooltip follows it there.
    const observer = new ResizeObserver(place);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [active, plot]);

  const scrubTo = (event: PointerEvent<SVGSVGElement>) => {
    const ctm = event.currentTarget.getScreenCTM();
    if (!ctm) return;
    const x = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse()).x;
    onScrub(marks[nearestMark(marks, x)]!);
  };
  const leave = (event: PointerEvent<SVGSVGElement>) => {
    // A cursor the keyboard is holding stays until focus leaves.
    if (!event.currentTarget.matches(':focus-visible')) onScrub(null);
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'Escape' && active) {
      onScrub(null);
      return;
    }
    const next = stepMark(marks.length, activeIndex, event.key);
    if (next === null) return;
    event.preventDefault();
    onScrub(marks[next]!);
  };
  // The area fill is the price line closed down to the plot's bottom edge.
  const area = `${chart.line} L ${plot.right} ${plot.bottom} L ${plot.left} ${plot.bottom} Z`;
  const tickLabelY = chart.height - 6;

  return (
    <>
      <svg
        ref={svgRef}
        className="noxa-chart-svg"
        viewBox={`0 0 ${CHART_WIDTH} ${chart.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="slider"
        aria-label={`${symbol} market cap`}
        aria-valuemin={0}
        aria-valuemax={nowIndex}
        aria-valuenow={activeIndex ?? nowIndex}
        aria-valuetext={`${read.marketCap}, ${read.time}`}
        tabIndex={0}
        // A click or tap reads the chart without focusing it, so only the keyboard shows its outline.
        onMouseDown={(event) => event.preventDefault()}
        onPointerDown={scrubTo}
        onPointerMove={scrubTo}
        onPointerLeave={leave}
        onPointerCancel={leave}
        onKeyDown={onKeyDown}
        onBlur={() => onScrub(null)}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {chart.yTicks.map((tick) => (
          <g key={tick.y}>
            <line className="noxa-chart-grid" x1="8" x2={plot.right} y1={tick.y} y2={tick.y} />
            <text className="noxa-chart-ytick" x={CHART_WIDTH - 4} y={tick.y - 4} textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}
        <path className="noxa-chart-area" d={area} fill={`url(#${fillId})`} />
        <path className="noxa-chart-line" d={chart.line} fill="none" />
        <circle className="noxa-chart-live-dot" cx={chart.live.x} cy={chart.live.y} r="4.5" />
        {active && (
          <g className="noxa-chart-cursor">
            <line x1={active.x} x2={active.x} y1={plot.top} y2={plot.bottom} />
            <circle cx={active.x} cy={active.y} r="4.5" />
          </g>
        )}
        <rect
          className="noxa-chart-scrub-hit"
          x="8"
          y={plot.top}
          width={plot.right - 8}
          height={plot.bottom - plot.top}
        />
        {chart.xTicks.map((tick) => (
          <text key={tick.x} className="noxa-chart-xtick" x={tick.x} y={tickLabelY} textAnchor="middle">
            {tick.label}
          </text>
        ))}
      </svg>
      {active && (
        <div ref={tooltipRef} className="token-chart-tooltip" aria-hidden="true">
          <span className="token-chart-tooltip-label">Market cap</span>
          <span className="token-chart-tooltip-value">{active.marketCap}</span>
          <span className="token-chart-tooltip-time">{active.time}</span>
        </div>
      )}
    </>
  );
}
