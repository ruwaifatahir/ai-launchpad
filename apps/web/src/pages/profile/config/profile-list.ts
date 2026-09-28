/** Tokens per page, from the sizes the creators route allows (6, 10, 20, 24 or 50): its own default. */
export const PROFILE_PAGE_SIZE = 24;

/** How often the list re-asks the backend, which holds each answer for five seconds. */
export const PROFILE_REFRESH_MS = 5_000;

/** Cards above the fold on a desktop viewport: their images load eagerly with high priority. */
export const PROFILE_EAGER_CARDS = 10;
