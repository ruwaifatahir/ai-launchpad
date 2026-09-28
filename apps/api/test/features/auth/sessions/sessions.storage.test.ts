import { describe, expect, it, vi } from "vitest";

import { storeNonce, takeNonce } from "@/features/auth/sessions/sessions.storage";
import { redis } from "@/lib/redis/client";

describe("sessions.storage", () => {
  it("storeNonce writes under a namespaced key, so a nonce cannot collide with another feature's", () => {
    storeNonce("abc123");

    expect(redis.setex).toHaveBeenCalledWith("siwe:nonce:abc123", 300, "1");
  });

  it("storeNonce sets a five minute expiry, which is what makes an unused nonce die on its own", () => {
    storeNonce("abc123");

    expect(vi.mocked(redis.setex).mock.calls[0][1]).toBe(300);
  });

  it("takeNonce reads and deletes in one command, so two requests racing the same nonce cannot both win", async () => {
    vi.mocked(redis.getdel).mockResolvedValue("1");

    await takeNonce("abc123");

    expect(redis.getdel).toHaveBeenCalledWith("siwe:nonce:abc123");
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("takeNonce reports true when the key was there, which is the caller's signal the nonce was unused", async () => {
    vi.mocked(redis.getdel).mockResolvedValue("1");

    await expect(takeNonce("abc123")).resolves.toBe(true);
  });

  it("takeNonce reports false when the key is gone, which covers both an expired nonce and one already spent", async () => {
    vi.mocked(redis.getdel).mockResolvedValue(null);

    await expect(takeNonce("abc123")).resolves.toBe(false);
  });
});
