import { cx } from '@/shared/lib';

type Option<V> = { readonly value: V; readonly label: string };

type SearchFilterRowProps<V extends string | null> = {
  label: string;
  options: readonly Option<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
};

/** One row of toggle buttons in the search dialog's filter panel: sort, age or pair. */
export function SearchFilterRow<V extends string | null>({
  label,
  options,
  value,
  onChange,
  className,
}: SearchFilterRowProps<V>) {
  return (
    <div className="spotlight-filter-group" role="group" aria-label={label}>
      <span className="spotlight-filter-label" aria-hidden="true">
        {label}
      </span>
      <div className={cx('spotlight-filter-options', className)}>
        {options.map((option) => (
          <button
            key={option.value ?? ''}
            type="button"
            className={cx('spotlight-filter-pill', option.value === value && 'is-active')}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
