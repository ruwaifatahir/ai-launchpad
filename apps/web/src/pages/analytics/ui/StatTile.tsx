import { RollingNumber } from '@/shared/ui/rolling-number';
import type { MetricStat } from '../model/analytics';

/** One metric cell of an analytics stats grid. */
export function StatTile({ stat }: { stat: MetricStat }) {
  return (
    <div>
      <span>{stat.label}</span>
      <strong>
        <RollingNumber
          value={stat.value}
          label={`${stat.value} ${stat.label.toLowerCase()}`}
          className="analytics-stat-value"
        />
      </strong>
      <small>{stat.note}</small>
    </div>
  );
}
