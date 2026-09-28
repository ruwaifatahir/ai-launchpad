import { readIndexer } from "@/lib/indexer/client";

// The time the token's pool opened, in unix seconds, left as text so it stays exact.
export interface GraduationRow {
  graduatedAt: string;
}

// The indexer marks a launch graduated when the factory's PoolGraduated opens its pool,
// with that block's time, and never unmarks it. A launch still on its curve, only
// swept, rescued, or not yet indexed has no row here.
export const findGraduationByToken = async (
  token: string,
): Promise<GraduationRow | null> => {
  const [row] = await readIndexer<GraduationRow>(
    "agents",
    `SELECT graduation_timestamp::text AS "graduatedAt"
     FROM indexer.launch
     WHERE token = $1 AND graduated AND graduation_timestamp IS NOT NULL`,
    [token],
  );

  return row ?? null;
};
