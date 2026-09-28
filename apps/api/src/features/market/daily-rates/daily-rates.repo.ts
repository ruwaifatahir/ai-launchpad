import prisma from "@/config/database";

// Times are unix seconds here and Dates in Prisma. A day is stored as the date its UTC
// day starts on.
const dateOf = (seconds: number) => new Date(seconds * 1000);
const dayOfDate = (date: Date) => date.getTime() / 1000;

// The days a quote asset already has a rate for, as unix seconds.
export const findStoredDays = async (chainId: number, quoteAsset: string) => {
  const rows = await prisma.dailyRate.findMany({
    where: { chainId, quoteAsset },
    select: { day: true },
  });

  return new Set(rows.map((row) => dayOfDate(row.day)));
};

export interface NewDailyRate {
  chainId: number;
  quoteAsset: string;
  day: number;
  answer: bigint;
  decimals: number;
  feed: string;
  roundId: bigint;
  roundUpdatedAt: number;
}

// Two runs at once may both find a day missing. The key holds one row a day, and the
// second insert is skipped rather than failing its run.
export const createDailyRate = (rate: NewDailyRate) =>
  prisma.dailyRate.createMany({
    data: [
      {
        chainId: rate.chainId,
        quoteAsset: rate.quoteAsset,
        day: dateOf(rate.day),
        answer: rate.answer.toString(),
        decimals: rate.decimals,
        feed: rate.feed,
        roundId: rate.roundId.toString(),
        roundUpdatedAt: dateOf(rate.roundUpdatedAt),
      },
    ],
    skipDuplicates: true,
  });

// A stored rate as pricing reads it: the raw answer as text, so it stays exact.
export interface StoredRate {
  quoteAsset: string;
  day: number;
  answer: string;
  decimals: number;
}

// Every rate stored for this chain from first to last, both unix seconds, both kept.
export const findDailyRates = async (
  chainId: number,
  first: number,
  last: number,
): Promise<StoredRate[]> => {
  const rows = await prisma.dailyRate.findMany({
    where: { chainId, day: { gte: dateOf(first), lte: dateOf(last) } },
    select: { quoteAsset: true, day: true, answer: true, decimals: true },
  });

  return rows.map((row) => ({
    quoteAsset: row.quoteAsset,
    day: dayOfDate(row.day),
    answer: row.answer.toFixed(0),
    decimals: row.decimals,
  }));
};
