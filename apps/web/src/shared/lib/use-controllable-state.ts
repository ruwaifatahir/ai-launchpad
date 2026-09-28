import { useCallback, useState } from 'react';

type ControllableStateOptions<T> = {
  /** Controlled value. When defined, the component mirrors it and never stores its own. */
  value?: T | undefined;
  /** Initial value for uncontrolled usage. */
  defaultValue: T;
  onChange?: ((value: T) => void) | undefined;
};

/** Lets a UI primitive work both controlled (`value` + `onChange`) and uncontrolled (`defaultValue`). */
export function useControllableState<T>({ value, defaultValue, onChange }: ControllableStateOptions<T>) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setUncontrolled(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  return [current, setValue] as const;
}
