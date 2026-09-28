// Every analytics figure is counted in UTC days, each keyed by its first second.
export const DAY = 86_400;

// The start of the UTC day a unix second falls in.
export const dayOf = (seconds: number) => Math.floor(seconds / DAY) * DAY;

// The last full UTC day, yesterday in UTC, as of now in milliseconds. Today so far is
// never counted.
export const lastFullDay = (now: number = Date.now()) => dayOf(now / 1000) - DAY;

// Every day from first to last, both kept, oldest first. Empty when last is before first.
export const daysFrom = (first: number, last: number) =>
  Array.from(
    { length: Math.max(0, (last - first) / DAY + 1) },
    (_, i) => first + i * DAY,
  );
