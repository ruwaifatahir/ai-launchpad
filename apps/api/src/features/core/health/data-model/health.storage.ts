import { redis } from "@/lib/redis/client";

export const pingRedis = () => redis.ping();
