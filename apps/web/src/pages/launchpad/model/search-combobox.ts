import { useState } from 'react';
import type { SearchResult } from './token-search';

/**
 * Which result is highlighted, or the first when none is. Results are told apart by address, so a
 * poll that reorders them does not move the highlight onto another token, and a token no longer
 * listed hands it to the first result.
 */
export function activeResultIndex(results: SearchResult[], activeAddress: string | null): number {
  return Math.max(
    0,
    results.findIndex((result) => result.address === activeAddress),
  );
}

/** The result highlighted after an arrow key, wrapping past either end. */
export function moveActive(index: number, count: number, direction: 'up' | 'down'): number {
  if (count === 0) return 0;
  return (index + (direction === 'down' ? 1 : -1) + count) % count;
}

/** The highlighted result among `results`, moved by the arrow keys or the pointer, as the WAI-ARIA combobox pattern keeps it. */
export function useActiveResult(results: SearchResult[]) {
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const activeIndex = activeResultIndex(results, activeAddress);
  return {
    activeIndex,
    active: results[activeIndex],
    move: (direction: 'up' | 'down') =>
      setActiveAddress(results[moveActive(activeIndex, results.length, direction)]?.address ?? null),
    highlight: (index: number) => {
      if (index !== activeIndex) setActiveAddress(results[index]?.address ?? null);
    },
  };
}
