import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/core/connections/data-model/connections.repo", () => ({
  createConsent: vi.fn(),
  findLatestConsentByToken: vi.fn(),
}));
vi.mock("@/features/core/graduations/reading", () => ({
  readTokenGraduation: vi.fn(),
}));

import { readTokenGraduation } from "@/features/core/graduations/reading";
import {
  createConsent,
  findLatestConsentByToken,
} from "@/features/core/connections/data-model/connections.repo";
import {
  readConsentState,
  readConsentText,
  recordConsent,
  requireCurrentConsent,
} from "@/features/core/connections/domain/consent";

const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e" as const;
const wallet = "0x1111111111111111111111111111111111111111" as const;
const graduatedAt = new Date("2026-03-01T12:00:00.000Z");
const agreedAt = new Date("2026-05-01T09:00:00.000Z");

const row = { id: "c1", token, wallet, version: 1, agreedAt };

const currentVersion = async () => (await readConsentText({ token })).version;

const allPoints = async () =>
  (await readConsentText({ token })).sections
    .flatMap((section) => section.points)
    .join(" ")
    .toLowerCase();

describe("readConsentText", () => {
  beforeEach(() => {
    vi.mocked(readTokenGraduation).mockResolvedValue(graduatedAt);
  });

  it("serves the text and its version from the backend, so a panel deploy cannot change what creators are agreeing to", async () => {
    const consent = await readConsentText({ token });

    expect(consent.version).toBeGreaterThan(0);
    expect(consent.title.length).toBeGreaterThan(0);
    expect(consent.sections.length).toBeGreaterThan(0);
    expect(consent.sections.every((section) => section.points.length > 0)).toBe(true);
  });

  it("names what the agent does: original text posts, on a schedule the creator sets, up to five a day, written by AI with nothing approving each one", async () => {
    const points = await allPoints();

    expect(points).toContain("original text posts");
    expect(points).toContain("schedule you set");
    expect(points).toContain("five posts a day");
    expect(points).toContain("ai");
    expect(points).toContain("nobody reads a post before it goes out");
  });

  it("names every automated action the agent never takes, because X requires the agreement to list them rather than leave them unsaid", async () => {
    const points = await allPoints();

    for (const never of [
      "never replies",
      "never likes",
      "never follows",
      "never quotes",
      "never names another account",
      "never posts an image",
      "never posts a link",
    ])
      expect(points).toContain(never);
  });

  it("says the permission X asks for covers more than the agent uses and that the agent reads nothing, because the creator meets X's own wording minutes later", async () => {
    const points = await allPoints();

    expect(points).toContain("wider than what your agent uses");
    expect(points).toContain("your agent reads nothing");
  });

  it("names the two steps the creator takes by hand on X, because no API sets either one and AI Launchpad takes their word", async () => {
    const points = await allPoints();

    expect(points).toContain("automated label");
    expect(points).toContain("bio");
    expect(points).toContain("takes your word");
  });

  it("refuses a token that has not graduated, because a creator is not asked for an X account before there is anything to publish about", async () => {
    vi.mocked(readTokenGraduation).mockResolvedValue(null);

    await expect(readConsentText({ token })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("records nothing, so reading the agreement is never mistaken for agreeing to it", async () => {
    await readConsentText({ token });

    expect(createConsent).not.toHaveBeenCalled();
  });
});

describe("recordConsent", () => {
  beforeEach(() => {
    vi.mocked(readTokenGraduation).mockResolvedValue(graduatedAt);
    vi.mocked(createConsent).mockResolvedValue(row);
  });

  it("records the version agreed to and the wallet that agreed, because the agreement is worth nothing without naming both", async () => {
    const version = await currentVersion();

    await recordConsent({ token }, { version }, wallet);

    expect(createConsent).toHaveBeenCalledWith(token, { wallet, version });
  });

  it("refuses a version that is not the current one, so a creator with a stale panel open never records agreement to wording nobody is showing", async () => {
    const version = await currentVersion();

    await expect(
      recordConsent({ token }, { version: version + 1 }, wallet),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("writes nothing when it refuses a stale version, so the refusal leaves no record of an agreement that was not given", async () => {
    const version = await currentVersion();

    await expect(
      recordConsent({ token }, { version: version - 1 }, wallet),
    ).rejects.toThrow();
    expect(createConsent).not.toHaveBeenCalled();
  });

  it("refuses a token that has not graduated, which is what connecting an X account waits for", async () => {
    vi.mocked(readTokenGraduation).mockResolvedValue(null);

    await expect(recordConsent({ token }, { version: 1 }, wallet)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(createConsent).not.toHaveBeenCalled();
  });

  it("checks graduation before the version, so an ungraduated creator is told to wait rather than told their text is stale", async () => {
    vi.mocked(readTokenGraduation).mockResolvedValue(null);

    await expect(
      recordConsent({ token }, { version: 999 }, wallet),
    ).rejects.toMatchObject({
      message: expect.stringContaining("graduated"),
    });
  });

  it("writes a second agreement when the creator agrees again, because consent is append only and nothing updates it", async () => {
    const version = await currentVersion();

    await recordConsent({ token }, { version }, wallet);
    await recordConsent({ token }, { version }, wallet);

    expect(createConsent).toHaveBeenCalledTimes(2);
  });

  it("returns only what the write recorded, leaving the text to the read that owns it", async () => {
    const version = await currentVersion();

    const consent = await recordConsent({ token }, { version }, wallet);

    expect(Object.keys(consent)).toEqual(["token", "version", "agreedAt"]);
  });

  it("lets an unreadable graduation through as a failure rather than a refusal, so a dead indexer never records an agreement for an ungraduated token", async () => {
    vi.mocked(readTokenGraduation).mockRejectedValue(new Error("fetch failed"));

    await expect(recordConsent({ token }, { version: 1 }, wallet)).rejects.toThrow(
      "fetch failed",
    );
    expect(createConsent).not.toHaveBeenCalled();
  });
});

describe("requireCurrentConsent", () => {
  beforeEach(() => {
    vi.mocked(readTokenGraduation).mockResolvedValue(graduatedAt);
  });

  it("passes a creator whose latest agreement is at the current version, which is the gate the handshake asks about", async () => {
    const version = await currentVersion();

    vi.mocked(findLatestConsentByToken).mockResolvedValue({ ...row, version });

    await expect(requireCurrentConsent(token)).resolves.toBeUndefined();
  });

  it("reads the agreement of the token it was handed, so one creator's agreement never lets another token connect", async () => {
    vi.mocked(findLatestConsentByToken).mockResolvedValue(row);

    await requireCurrentConsent(token);

    expect(findLatestConsentByToken).toHaveBeenCalledWith(token);
  });

  it("refuses a creator who has agreed to nothing, because X says authorizing through OAuth is not by itself consent to take automated actions", async () => {
    vi.mocked(findLatestConsentByToken).mockResolvedValue(null);

    await expect(requireCurrentConsent(token)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("refuses a creator whose latest agreement is below the current version, which is what will silence an agent the day a material change bumps it", async () => {
    const version = await currentVersion();

    vi.mocked(findLatestConsentByToken).mockResolvedValue({
      ...row,
      version: version - 1,
    });

    await expect(requireCurrentConsent(token)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("tells a creator who never agreed apart from one whose agreement went stale, so each is told the step they actually have to take", async () => {
    vi.mocked(findLatestConsentByToken).mockResolvedValue(null);
    const missing = await requireCurrentConsent(token).catch(
      (error: Error) => error.message,
    );

    vi.mocked(findLatestConsentByToken).mockResolvedValue({
      ...row,
      version: (await currentVersion()) - 1,
    });
    const stale = await requireCurrentConsent(token).catch(
      (error: Error) => error.message,
    );

    expect(missing).not.toBe(stale);
  });
});

describe("readConsentState", () => {
  beforeEach(() => {
    vi.mocked(readTokenGraduation).mockResolvedValue(graduatedAt);
  });

  it("reports a creator who has agreed to nothing as not agreed, which is what the connection read turns into the first outstanding gate", async () => {
    vi.mocked(findLatestConsentByToken).mockResolvedValue(null);

    expect(await readConsentState(token)).toEqual({ agreed: false, current: false });
  });

  it("reports an agreement at the current version as current, which is the only state that lets an agent publish", async () => {
    vi.mocked(findLatestConsentByToken).mockResolvedValue({
      ...row,
      version: await currentVersion(),
    });

    expect(await readConsentState(token)).toEqual({ agreed: true, current: true });
  });

  it("reports an agreement below the current version as agreed but out of date, so a version bump reads as a step to retake rather than as never having agreed", async () => {
    vi.mocked(findLatestConsentByToken).mockResolvedValue({
      ...row,
      version: (await currentVersion()) - 1,
    });

    expect(await readConsentState(token)).toEqual({ agreed: true, current: false });
  });

  it("reads the agreement of the token it was handed, so one creator's agreement never answers for another token", async () => {
    vi.mocked(findLatestConsentByToken).mockResolvedValue(row);

    await readConsentState(token);

    expect(findLatestConsentByToken).toHaveBeenCalledWith(token);
  });
});
