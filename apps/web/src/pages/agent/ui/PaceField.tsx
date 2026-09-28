import { useId } from 'react';
import { PACE_RANGE } from '../config/persona-limits';

const PACES = Array.from({ length: PACE_RANGE.max - PACE_RANGE.min + 1 }, (_, index) => PACE_RANGE.min + index);

/** How many posts a day, picked from 1 to 5 as one row of blocks. */
export function PaceField({
  pace,
  error,
  onChange,
}: {
  pace: number;
  error: string | undefined;
  onChange: (pace: number) => void;
}) {
  const id = useId();
  return (
    <fieldset className="agent-field agent-pace" aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}>
      <legend>Pace</legend>
      <div className="agent-pace-options">
        {PACES.map((value) => (
          <label key={value} className="agent-pace-option">
            <input type="radio" name="pace" value={value} checked={pace === value} onChange={() => onChange(value)} />
            <span>{value}</span>
          </label>
        ))}
      </div>
      <p id={`${id}-hint`} className="agent-field-hint">
        {pace === 1 ? '1 post a day' : `${pace} posts a day`}, once it can post.
      </p>
      {error && (
        <p id={`${id}-error`} className="agent-field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
