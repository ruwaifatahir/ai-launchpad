import type { Address } from "viem";
import { ApiError } from "@/shared";
import { readTokenGraduation } from "@/features/core/graduations/reading";

export const requireGraduation = async (token: Address): Promise<void> => {
  const graduatedAt = await readTokenGraduation(token);

  if (!graduatedAt)
    throw ApiError.conflict(
      "This token has not graduated yet, so its agent cannot connect an X account.",
      "TOKEN_NOT_GRADUATED",
    );
};
