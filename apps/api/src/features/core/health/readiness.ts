import { ApiError } from "@/shared";
import { pingDatabase } from "@/features/core/health/data-model/health.repo";
import { pingRedis } from "@/features/core/health/data-model/health.storage";

const PROBE_TIMEOUT_MS = 2000;

const answered = async (probe: Promise<unknown>) => {
  let timer: NodeJS.Timeout | undefined;

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(reject, PROBE_TIMEOUT_MS, new Error("probe timed out"));
  });

  try {
    await Promise.race([probe, expiry]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export const checkReadiness = async () => {
  const [database, cache] = await Promise.all([
    answered(pingDatabase()),
    answered(pingRedis()),
  ]);

  if (!database && !cache) {
    throw ApiError.unavailable("The database and Redis did not answer.");
  }

  if (!database) {
    throw ApiError.unavailable("The database did not answer.");
  }

  if (!cache) {
    throw ApiError.unavailable("Redis did not answer.");
  }

  return { database: "up", redis: "up" };
};
