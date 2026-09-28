import * as Tabs from '@/shared/ui/tabs';

type Option<V extends string> = { readonly value: V; readonly label: string };

type FilterTabsProps<V extends string> = {
  label: string;
  options: readonly Option<V>[];
  value: V;
  onValueChange: (value: V) => void;
};

/** One pill-shaped tab group in the explore section header (sort, age, ...). The section owns the value. */
export function FilterTabs<V extends string>({ label, options, value, onValueChange }: FilterTabsProps<V>) {
  return (
    <div className="launch-explore-filter-group tabs-pill">
      <Tabs.Root value={value} onValueChange={onValueChange}>
        <Tabs.List className="tabs-list" aria-label={label}>
          <Tabs.Indicator />
          {options.map((option) => (
            <Tabs.Tab key={option.value} value={option.value} className="tabs-tab launch-explore-filter">
              {option.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.Root>
    </div>
  );
}
