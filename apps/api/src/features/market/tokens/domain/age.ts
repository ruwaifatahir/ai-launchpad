import type { ListAge } from "@/features/market/tokens/domain/schema";

const AGE_SECONDS: Record<ListAge, number | null> = {
  all: null,
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
};

// The earliest unix second an age reaches, or null for every token. Read when the
// cache misses, so a held page measures its window from when it was read.
export const sinceOf = (age: ListAge) => {
  const seconds = AGE_SECONDS[age];

  return seconds === null ? null : Math.floor(Date.now() / 1000) - seconds;
};
