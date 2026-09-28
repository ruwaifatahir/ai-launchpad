/** Longest input each field takes. Name and ticker match the contract's byte limits. */
export const FIELD_LIMITS = {
  name: 64,
  ticker: 16,
  description: 256,
  xHandle: 15,
  telegram: 32,
} as const;

/** What the API stores as a logo; a bigger file or another type, SVG included, it refuses by its bytes. */
export const LOGO_FILE = {
  maxMegabytes: 4,
  maxBytes: 4 * 1024 * 1024,
  types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  /** `types` as the creator reads them. */
  typeNames: 'PNG, JPEG, WebP or GIF',
} as const;
