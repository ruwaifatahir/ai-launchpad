/** Width of a digit strip, in em: `.rolling-digit` reserves this much per digit. */
const DIGIT_EM = 0.62;
/** A point or a thousands comma is narrower than a digit. */
const SEPARATOR_EM = 0.3;

/**
 * How wide an amount runs, in em of its own font size, so the font can shrink to keep a long
 * amount inside its field. Slightly generous, so the last digit never clips.
 */
export function amountEms(text: string): number {
  let ems = 0;
  for (const char of text) ems += char === '.' || char === ',' ? SEPARATOR_EM : DIGIT_EM;
  return Math.round(ems * 1.04 * 100) / 100;
}
