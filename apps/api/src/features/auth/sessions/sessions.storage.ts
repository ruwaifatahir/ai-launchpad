import { redis } from "@/lib/redis/client";

const NONCE_PREFIX = "siwe:nonce:";
const NONCE_TTL_SECONDS = 5 * 60;

export const storeNonce = (nonce: string) =>
  redis.setex(`${NONCE_PREFIX}${nonce}`, NONCE_TTL_SECONDS, "1");

export const takeNonce = async (nonce: string) =>
  (await redis.getdel(`${NONCE_PREFIX}${nonce}`)) !== null;
