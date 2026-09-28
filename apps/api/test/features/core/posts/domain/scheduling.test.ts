import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/agents/agents.repo", () => ({
  claimAgentSlot: vi.fn(),
  findDueAgentsByNextPostAt: vi.fn(),
}));
// Mocked so the test can assert that the tick reads no graduation. A connection can
// only exist for a graduated token, so graduation is true by construction here
// and a read every minute would buy nothing.
vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));

import { readTokenGraduation } from "@/features/core/graduations/reading";
import { logger } from "@/lib/logger";
import {
  claimAgentSlot,
  findDueAgentsByNextPostAt,
} from "@/features/core/agents/agents.repo";
import { claimDueSlots } from "@/features/core/posts/domain/scheduling";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const now = new Date("2026-05-01T09:20:00.000Z");

const due = (pace: number, nextPostAt: Date | null) => {
  vi.mocked(findDueAgentsByNextPostAt).mockResolvedValue([{ token, pace, nextPostAt }]);
};

const scheduled = () => vi.mocked(claimAgentSlot).mock.calls.at(-1)![2];

const drawSlot = async (pace: number, nextPostAt: Date | null = null) => {
  due(pace, nextPostAt);
  await claimDueSlots();

  return scheduled();
};

describe("claimDueSlots", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(claimAgentSlot).mockResolvedValue({ count: 1 });
    due(4, null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cuts the UTC day into one window per post the pace asks for and schedules inside the window after this moment, so four posts a day are four six hour windows", async () => {
    for (let draw = 0; draw < 200; draw += 1) {
      const slot = await drawSlot(4);

      expect(slot.getTime()).toBeGreaterThanOrEqual(Date.UTC(2026, 4, 1, 12));
      expect(slot.getTime()).toBeLessThan(Date.UTC(2026, 4, 1, 18));
      expect(slot.getTime() % (60 * 1000)).toBe(0);
    }
  });

  it("carries the next window into the following UTC day when this moment sits in the last one, so a pace of one is one post a day rather than none", async () => {
    const slot = await drawSlot(1);

    expect(slot.getTime()).toBeGreaterThanOrEqual(Date.UTC(2026, 4, 2));
    expect(slot.getTime()).toBeLessThan(Date.UTC(2026, 4, 3));
  });

  it("draws the minute afresh for every slot, so an account never posts at the same clock time two days running and carries no automation fingerprint", async () => {
    const clockTimes = new Set<number>();

    for (let day = 0; day < 20; day += 1) {
      vi.setSystemTime(new Date(now.getTime() + day * DAY_MS));

      const slot = await drawSlot(1);

      clockTimes.add(slot.getTime() % DAY_MS);
    }

    expect(clockTimes.size).toBeGreaterThan(1);
  });

  it("treats an agent that has never been scheduled as due now, so a creator who finishes their attestation is published within the minute", async () => {
    due(4, null);

    await expect(claimDueSlots()).resolves.toEqual([token]);
    expect(findDueAgentsByNextPostAt).toHaveBeenCalledWith(now);
  });

  it("publishes an agent behind by less than one window, because a slot the tick reached late is still that slot", async () => {
    due(4, new Date(now.getTime() - 6 * HOUR_MS + 60 * 1000));

    await expect(claimDueSlots()).resolves.toEqual([token]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("drops an agent behind by more than one window rather than making the posts up, because a burst after an outage is the manipulation X suspends apps for", async () => {
    due(4, new Date(now.getTime() - 6 * HOUR_MS - 60 * 1000));

    await expect(claimDueSlots()).resolves.toEqual([]);
  });

  it("counts a slot behind by exactly one window as missed, because due is behind by less than one window and a boundary left to chance is a rule nobody chose", async () => {
    due(4, new Date(now.getTime() - 6 * HOUR_MS));

    await expect(claimDueSlots()).resolves.toEqual([]);
  });

  it("never schedules a slot that has already passed, because a slot in the past is due on the very next tick and two posts a minute apart is the burst the pace exists to prevent", async () => {
    const lateButDue = new Date(Date.UTC(2026, 4, 1, 6, 5));

    vi.setSystemTime(new Date(Date.UTC(2026, 4, 1, 12, 4)));

    for (let draw = 0; draw < 200; draw += 1) {
      const slot = await drawSlot(4, lateButDue);

      expect(slot.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("logs a dropped slot at warn, because work AI Launchpad discards silently is invisible to everyone", async () => {
    due(4, new Date(now.getTime() - DAY_MS));

    await claimDueSlots();

    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { token });
  });

  it("recomputes a missed slot from this moment rather than from the time it missed, so a worker down for a day does not wake up still behind", async () => {
    const slot = await drawSlot(4, new Date(now.getTime() - DAY_MS));

    expect(slot.getTime()).toBeGreaterThanOrEqual(Date.UTC(2026, 4, 1, 12));
    expect(slot.getTime()).toBeLessThan(Date.UTC(2026, 4, 1, 18));
  });

  it("claims conditional on the time it read, so the one write is both the claim and the reschedule", async () => {
    const claimed = new Date(now.getTime() - 60 * 1000);

    due(4, claimed);
    await claimDueSlots();

    expect(claimAgentSlot).toHaveBeenCalledWith(token, claimed, expect.any(Date));
  });

  it("publishes nothing for an agent another worker claimed first, so two instances of AI Launchpad produce one post rather than two", async () => {
    vi.mocked(claimAgentSlot).mockResolvedValue({ count: 0 });

    await expect(claimDueSlots()).resolves.toEqual([]);
  });

  it("reads no graduation, because a connection can only exist for a graduated token and a tick every minute would pay for that answer forever", async () => {
    due(4, new Date(now.getTime() - DAY_MS));
    await claimDueSlots();

    expect(readTokenGraduation).not.toHaveBeenCalled();
  });
});
