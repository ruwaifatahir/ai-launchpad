import { fillDailyRates } from "@/features/market/daily-rates/filling";

// The job carries no data: each run works out for itself which days are missing.
export const runDailyRates = async () => {
  await fillDailyRates();
};
