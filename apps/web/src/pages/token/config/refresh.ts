/** How often the Token page re-reads the chain, so trades and Graduation show up without a reload. */
export const REFRESH_MS = 10_000;

/** How often the chart and the Recent trades and Holders tabs re-ask the backend, which holds each answer for five seconds. */
export const MARKET_REFRESH_MS = 5_000;
