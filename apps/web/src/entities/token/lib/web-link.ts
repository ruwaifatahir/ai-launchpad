/** `value` if it is an http(s) link. Token metadata is anyone's input, so nothing else becomes an href or src. */
export function webLink(value: string): string | null {
  const trimmed = value.trim();
  if (!URL.canParse(trimmed)) return null;
  const { protocol } = new URL(trimmed);
  return protocol === 'https:' || protocol === 'http:' ? trimmed : null;
}
