import { useCallback, useSyncExternalStore } from 'react';

type Clock = { now: number; listeners: Set<() => void>; timer: ReturnType<typeof setInterval> | null };

/** One clock per interval, shared by everything reading it, so they all re-render on the same tick. */
const clocks = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = { now: Date.now(), listeners: new Set(), timer: null };
    clocks.set(intervalMs, clock);
  }
  return clock;
}

/** The current time in ms, re-read every `intervalMs`, so what is drawn from it (an age, a chart's "now") keeps moving between reads. */
export function useNow(intervalMs: number): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const clock = clockFor(intervalMs);
      clock.listeners.add(onChange);
      if (clock.timer === null) {
        // The clock stood still while nobody read it. React re-reads the snapshot right after subscribing.
        clock.now = Date.now();
        clock.timer = setInterval(() => {
          clock.now = Date.now();
          for (const listener of clock.listeners) listener();
        }, intervalMs);
      }
      return () => {
        clock.listeners.delete(onChange);
        if (clock.listeners.size === 0 && clock.timer !== null) {
          clearInterval(clock.timer);
          clock.timer = null;
        }
      };
    },
    [intervalMs],
  );
  return useSyncExternalStore(subscribe, () => clockFor(intervalMs).now);
}
