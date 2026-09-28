import { getAddress } from "viem";
import { z } from "zod";
import { chainAddress } from "@/lib/chain/address";
import { redis } from "@/lib/redis/client";

const HANDSHAKE_PREFIX = "x:handshake:";
const HANDSHAKE_TTL_SECONDS = 10 * 60;

const RENEWAL_LOCK_PREFIX = "x:renewal:";
const RENEWAL_LOCK_TTL_SECONDS = 30;

const handshake = z.object({
  verifier: z.string(),
  token: chainAddress,
  wallet: z.string().transform((value) => getAddress(value)),
});

export const storeHandshake = (state: string, facts: z.infer<typeof handshake>) =>
  redis.setex(
    `${HANDSHAKE_PREFIX}${state}`,
    HANDSHAKE_TTL_SECONDS,
    JSON.stringify(facts),
  );

export const takeRenewalLock = async (token: string) =>
  (await redis.set(
    `${RENEWAL_LOCK_PREFIX}${token}`,
    "1",
    "EX",
    RENEWAL_LOCK_TTL_SECONDS,
    "NX",
  )) !== null;

export const releaseRenewalLock = (token: string) =>
  redis.del(`${RENEWAL_LOCK_PREFIX}${token}`);

export const takeHandshake = async (state: string) => {
  const stored = await redis.getdel(`${HANDSHAKE_PREFIX}${state}`);

  return stored === null ? null : handshake.parse(JSON.parse(stored));
};
