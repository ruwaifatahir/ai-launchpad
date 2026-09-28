import { describe, expect, it, vi } from "vitest";

import {
  releaseRenewalLock,
  storeHandshake,
  takeHandshake,
  takeRenewalLock,
} from "@/features/core/connections/data-model/connections.storage";
import { redis } from "@/lib/redis/client";

const state = "3yZq8s1Ur9Kd";
const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;
const other = "0xbcd4042de499d14e55001ccbb24a551f3b954096" as const;
const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e" as const;
const verifier = "aVerifierNobodyButTheAppHolds";

const handshake = { verifier, token, wallet };

describe("connections.storage", () => {
  it("stores the handshake under a namespaced key, so a state cannot collide with another feature's", async () => {
    await storeHandshake(state, handshake);

    expect(redis.setex).toHaveBeenCalledWith(
      `x:handshake:${state}`,
      expect.any(Number),
      expect.any(String),
    );
  });

  it("keys the handshake by the state alone, which is the only thing the callback carries back", async () => {
    await storeHandshake(state, handshake);

    expect(vi.mocked(redis.setex).mock.calls[0][0]).not.toContain(token);
  });

  it("stores the verifier, the token and the wallet, because all three have to survive the trip to X", async () => {
    await storeHandshake(state, handshake);

    expect(JSON.parse(String(vi.mocked(redis.setex).mock.calls[0][2]))).toEqual(
      handshake,
    );
  });

  it("sets a ten minute expiry, because five is not long enough for a creator who has to sign in to X first", async () => {
    await storeHandshake(state, handshake);

    expect(vi.mocked(redis.setex).mock.calls[0][1]).toBe(600);
  });

  it("takeHandshake reads and deletes in one command, so two requests racing one state cannot both win", async () => {
    vi.mocked(redis.getdel).mockResolvedValue(JSON.stringify(handshake));

    await takeHandshake(state);

    expect(redis.getdel).toHaveBeenCalledWith(`x:handshake:${state}`);
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("takeHandshake hands back the three facts exactly as they were stored, so neither address comes back in a casing its owner never sent", async () => {
    vi.mocked(redis.getdel).mockResolvedValue(JSON.stringify(handshake));

    await expect(takeHandshake(state)).resolves.toEqual(handshake);
  });

  it("takeHandshake finds nothing for a state already consumed or expired, which is what makes a replayed callback harmless", async () => {
    vi.mocked(redis.getdel).mockResolvedValue(null);

    await expect(takeHandshake(state)).resolves.toBeNull();
  });
});

describe("connections.storage, the renewal lock", () => {
  it("takes the lock only when nobody holds it, which is what makes one renewal run per connection rather than two", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    await expect(takeRenewalLock(token)).resolves.toBe(true);

    const [key, value, expiry, seconds, mode] = vi.mocked(redis.set).mock.calls[0];

    expect(key).toBe(`x:renewal:${token}`);
    expect(value).toBe("1");
    expect([expiry, mode]).toEqual(["EX", "NX"]);
    expect(seconds).toEqual(expect.any(Number));
  });

  it("reports the lock refused when another renewal already holds it, so the second caller can stand down rather than spend the same refresh credential", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    await expect(takeRenewalLock(token)).resolves.toBe(false);
  });

  it("keys the lock by the token, so one agent's renewal never blocks another agent's", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    await takeRenewalLock(other);

    expect(vi.mocked(redis.set).mock.calls[0][0]).toBe(`x:renewal:${other}`);
  });

  it("expires the lock on its own, so a process that died holding one does not leave a connection nothing can ever renew", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    await takeRenewalLock(token);

    expect(vi.mocked(redis.set).mock.calls[0][3]).toBe(30);
  });

  it("releases the lock by the same key it took, so a finished renewal frees the next caller rather than making it wait out the expiry", async () => {
    await releaseRenewalLock(token);

    expect(redis.del).toHaveBeenCalledWith(`x:renewal:${token}`);
  });
});
