import { useLayoutEffect, useRef } from 'react';

function placeIndicator(list: HTMLElement, indicator: HTMLElement, activeSelector: string, animate: boolean) {
  const active = list.querySelector<HTMLElement>(activeSelector);
  if (!active) {
    indicator.style.cssText = '';
    return;
  }
  const listBox = list.getBoundingClientRect();
  const activeBox = active.getBoundingClientRect();
  const x = activeBox.left - listBox.left - list.clientLeft;
  const y = activeBox.top - listBox.top - list.clientTop;
  indicator.style.cssText =
    `width:${active.offsetWidth}px;height:${active.offsetHeight}px;transform:translate(${x}px, ${y}px)` +
    (animate ? '' : ';transition:none');
}

/**
 * Positions an absolutely placed "pill" indicator under the active item of a list
 * (tabs, pagination, nav links). The list must be the indicator's offset parent.
 *
 * Styles are written straight to the indicator node so moving it never re-renders the list.
 * A change of active item slides the pill (see the CSS transition); mounting and resizing snap it.
 *
 * @param activeSelector CSS selector that matches the active item inside the list.
 * @param activeKey      Any value that changes whenever the active item changes.
 */
export function useSlidingIndicator<TList extends HTMLElement = HTMLElement>(
  activeSelector: string,
  activeKey: unknown,
) {
  const listRef = useRef<TList>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const hasPlaced = useRef(false);

  // Follow the active item.
  useLayoutEffect(() => {
    if (!listRef.current || !indicatorRef.current) return;
    placeIndicator(listRef.current, indicatorRef.current, activeSelector, hasPlaced.current);
    hasPlaced.current = true;
    // activeKey is not read inside: it is the signal that a different item became active, so re-measure.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [activeSelector, activeKey]);

  // Re-measure when the list's size changes (web fonts loading, responsive layout).
  // Kept separate so the observer is not re-created, and its initial callback does not
  // cancel the slide, every time the active item changes.
  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const observer = new ResizeObserver(() => placeIndicator(list, indicator, activeSelector, false));
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeSelector]);

  return { listRef, indicatorRef };
}
