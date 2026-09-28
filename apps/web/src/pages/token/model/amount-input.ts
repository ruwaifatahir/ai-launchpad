/**
 * What typing into an amount field keeps: digits and one decimal point, with a comma read as the
 * point, so the field never holds text. `1,5` → `1.5`, `1.2.3` → `1.23`, `abc` → ``.
 */
export function amountInput(text: string): string {
  const cleaned = text.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const [whole = '', ...fraction] = cleaned.split('.');
  return fraction.length > 0 ? `${whole}.${fraction.join('')}` : whole;
}
