import { cx } from '@/shared/lib';

type Segment = { digit: boolean; text: string };

// Static, so built once at module load instead of on every render.
const DIGIT_CELLS = Array.from({ length: 10 }, (_, digit) => (
  <span key={digit} className="rolling-digit-cell">
    {digit}
  </span>
));

/** Splits a formatted value into rolling digit strips and runs of static glyphs ("$", ".", "M", ...). */
function toSegments(value: string): Segment[] {
  const segments: Segment[] = [];
  for (const char of value) {
    const digit = char >= '0' && char <= '9';
    const last = segments.at(-1);
    if (!digit && last && !last.digit) last.text += char;
    else segments.push({ digit, text: char });
  }
  return segments;
}

type RollingNumberProps = {
  /** Pre-formatted value, e.g. `$208.75M`. */
  value: string;
  /** Accessible name. The visual digit strips are hidden from assistive tech. */
  label?: string;
  className?: string;
};

export function RollingNumber({ value, label, className }: RollingNumberProps) {
  return (
    <span className={cx('rolling-number', className)} aria-label={label}>
      {toSegments(value).map((segment, index) =>
        segment.digit ? (
          // Segments are positional: index is the stable identity of each glyph slot.
          // oxlint-disable-next-line react/no-array-index-key
          <span key={index} className="rolling-digit" aria-hidden="true">
            <span className="rolling-digit-strip" style={{ transform: `translate(0px, -${segment.text}em)` }}>
              {DIGIT_CELLS}
            </span>
          </span>
        ) : (
          // oxlint-disable-next-line react/no-array-index-key
          <span key={index} className="rolling-static">
            {segment.text}
          </span>
        ),
      )}
    </span>
  );
}
