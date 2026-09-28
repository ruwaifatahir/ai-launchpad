import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { cx, useControllableState, useSlidingIndicator } from '@/shared/lib';

/*
 * Compound, accessible tabs (WAI-ARIA tablist with roving tabindex and arrow-key navigation).
 * Styling stays with the caller, so the same primitive drives pill tabs, chart ranges, etc.
 *
 *   <Tabs.Root defaultValue="recent">
 *     <Tabs.List className="tabs-list" aria-label="Sort launches">
 *       <Tabs.Indicator />
 *       <Tabs.Tab value="recent" className="tabs-tab">Recent buys</Tabs.Tab>
 *     </Tabs.List>
 *     <Tabs.Panel value="recent">…</Tabs.Panel>
 *   </Tabs.Root>
 *
 * Tabs and panels are linked by ids the Root generates; a tab only points at a panel that is rendered.
 */

type TabsContextValue = {
  value: string;
  select: (value: string) => void;
  tabId: (value: string) => string;
  /** The id of a panel: one tab's, or with no `value` the one every tab shares. */
  panelId: (value?: string) => string;
  /** The rendered panel a tab controls, if any. */
  controlledPanel: (value: string) => string | undefined;
  registerPanel: (id: string) => () => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);
const IndicatorContext = createContext<RefObject<HTMLSpanElement | null> | null>(null);

function useTabsContext(component: string) {
  const context = use(TabsContext);
  if (!context) throw new Error(`<Tabs.${component}> must be rendered inside <Tabs.Root>`);
  return context;
}

/** Controlled with `value` and `onValueChange`, or uncontrolled with `defaultValue`, never both. */
type RootProps<T extends string> = {
  onValueChange?: (value: T) => void;
  children: ReactNode;
} & ({ value: T; defaultValue?: never } | { value?: never; defaultValue: T });

export function Root<T extends string>({ value, defaultValue, onValueChange, children }: RootProps<T>) {
  const [current, setCurrent] = useControllableState<T>({
    value,
    defaultValue: (value ?? defaultValue)!,
    onChange: onValueChange,
  });
  const baseId = useId();
  const [panels, setPanels] = useState<ReadonlySet<string>>(() => new Set());

  const registerPanel = useCallback((id: string) => {
    setPanels((previous) => new Set(previous).add(id));
    return () =>
      setPanels((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
  }, []);

  const context = useMemo<TabsContextValue>(() => {
    const panelId = (tab?: string) => (tab === undefined ? `${baseId}-panel` : `${baseId}-panel-${tab}`);
    return {
      value: current,
      // Every Tab under this Root is given one of T's values, so what it selects is a T.
      select: setCurrent as (value: string) => void,
      tabId: (tab) => `${baseId}-tab-${tab}`,
      panelId,
      controlledPanel: (tab) => [panelId(tab), panelId()].find((id) => panels.has(id)),
      registerPanel,
    };
  }, [baseId, current, setCurrent, panels, registerPanel]);
  return <TabsContext value={context}>{children}</TabsContext>;
}

const NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

function focusSiblingTab(event: KeyboardEvent<HTMLDivElement>) {
  if (!NAVIGATION_KEYS.has(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')];
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (index === -1) return;

  event.preventDefault();
  const last = tabs.length - 1;
  const nextIndex = {
    ArrowLeft: index === 0 ? last : index - 1,
    ArrowRight: index === last ? 0 : index + 1,
    Home: 0,
    End: last,
  }[event.key as 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'];
  const next = tabs[nextIndex];
  next?.focus();
  next?.click();
}

type ListProps = Omit<ComponentProps<'div'>, 'role'>;

export function List({ children, onKeyDown, ...props }: ListProps) {
  const { value } = useTabsContext('List');
  const { listRef, indicatorRef } = useSlidingIndicator<HTMLDivElement>('[role="tab"][aria-selected="true"]', value);

  return (
    // Per the WAI-ARIA tabs pattern the tabs take focus (roving tabindex), not the list itself.
    // oxlint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      {...props}
      ref={listRef}
      role="tablist"
      onKeyDown={(event) => {
        onKeyDown?.(event);
        focusSiblingTab(event);
      }}
    >
      <IndicatorContext value={indicatorRef}>{children}</IndicatorContext>
    </div>
  );
}

/** Sliding highlight behind the selected tab. Optional: omit it for unstyled tab lists. */
export function Indicator({ className = 'tabs-indicator' }: { className?: string }) {
  const indicatorRef = use(IndicatorContext);
  return <span ref={indicatorRef} className={className} aria-hidden="true" />;
}

type TabProps = Omit<ComponentProps<'button'>, 'value' | 'role' | 'type'> & { value: string };

export function Tab({ value, className, onClick, ...props }: TabProps) {
  const { value: selected, select, tabId, controlledPanel } = useTabsContext('Tab');
  const isSelected = value === selected;

  return (
    <button
      id={tabId(value)}
      aria-controls={controlledPanel(value)}
      {...props}
      type="button"
      role="tab"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      className={cx(className, isSelected && 'is-active')}
      onClick={(event) => {
        onClick?.(event);
        select(value);
      }}
    />
  );
}

type PanelProps = Omit<ComponentProps<'div'>, 'id' | 'role' | 'hidden'> & { value?: string };

/**
 * What the tabs show. With `value`, one tab's panel: it stays in the DOM, hidden, while another tab
 * is selected, and mounts its children only while its own is. Without `value`, one panel every tab
 * shares, such as a chart its range tabs redraw.
 */
export function Panel({ value, children, ...props }: PanelProps) {
  const { value: selected, tabId, panelId, registerPanel } = useTabsContext('Panel');
  const id = panelId(value);
  useEffect(() => registerPanel(id), [registerPanel, id]);
  const isSelected = value === undefined || value === selected;

  return (
    <div {...props} id={id} role="tabpanel" aria-labelledby={tabId(value ?? selected)} hidden={!isSelected}>
      {isSelected ? children : null}
    </div>
  );
}
