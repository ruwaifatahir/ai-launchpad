import type { Address } from "viem";
import { findGraduationByToken } from "@/features/core/graduations/graduations.repo";

// Graduation is the token's pool opening, read from the indexer. Null means
// locked: the pool has not opened, or the indexer has not reached the token yet, and
// either way the agent waits. An indexer failure is thrown, never read as locked.
export const readTokenGraduation = async (token: Address): Promise<Date | null> => {
  const graduation = await findGraduationByToken(token);

  return graduation ? new Date(Number(graduation.graduatedAt) * 1000) : null;
};
