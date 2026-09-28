type ClassValue = string | false | null | undefined;

/** Joins truthy class names: `cx('a', isActive && 'is-active')`. */
export function cx(...classes: ClassValue[]): string | undefined {
  return classes.filter(Boolean).join(' ') || undefined;
}
