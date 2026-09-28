import { useRef } from 'react';

/**
 * Runs a task unless the last one is still going, and resolves to its result; `undefined` when it
 * was skipped. It blocks a second click before the first one's busy state has rendered, which a
 * disabled button alone can't.
 */
export function useSingleFlight(): <T>(task: () => Promise<T>) => Promise<T | undefined> {
  const running = useRef(false);
  return async (task) => {
    if (running.current) return undefined;
    running.current = true;
    try {
      return await task();
    } finally {
      running.current = false;
    }
  };
}
