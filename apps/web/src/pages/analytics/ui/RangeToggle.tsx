import type { Range } from '../model/analytics';

const RANGES: { value: Range; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: 'all', label: 'All time' },
];

export function RangeToggle({ range, onChange }: { range: Range; onChange: (range: Range) => void }) {
  return (
    <div className="analytics-range-tabs" role="group" aria-label="Analytics range">
      {RANGES.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === range ? 'is-active' : undefined}
          aria-pressed={option.value === range}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
