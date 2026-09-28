import { ApiError } from "@/shared";
import {
  type LaunchRow,
  findLaunchByToken,
} from "@/features/market/launches/launches.repo";

// Every market route starts from the token's launch, and a token the indexer does not
// hold is a 404 on each of them alike. A token launched moments ago may not have
// reached the indexer yet, so the same address can answer a moment later.
export const requireLaunch = async (token: string): Promise<LaunchRow> => {
  const launch = await findLaunchByToken(token);

  if (!launch)
    throw ApiError.notFound(
      "The indexer holds no token at that address.",
      "TOKEN_NOT_FOUND",
    );

  return launch;
};
