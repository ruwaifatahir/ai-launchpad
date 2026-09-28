import { createHash } from "node:crypto";
import sharp, { type Sharp } from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The store and the repo are mocked. sharp is not: whether a file is really a
// picture, and what it becomes, is the behaviour under test, so real bytes go in
// and the bytes handed to the store are read back to see what came out.
vi.mock("@/lib/logo-store/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logo-store/client")>()),
  storeLogo: vi.fn(),
}));
vi.mock("@/features/core/logos/logos.repo", () => ({
  findLogoUrlByHash: vi.fn(),
  recordLogoUpload: vi.fn(),
}));

import { DECODE_SLOTS, uploadLogo } from "@/features/core/logos/domain/uploading";
import { LogoStoreUnreachableError, storeLogo } from "@/lib/logo-store/client";
import { findLogoUrlByHash, recordLogoUpload } from "@/features/core/logos/logos.repo";

const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const other = "0x1111111111111111111111111111111111111111";
const url = "https://app.ufs.sh/f/logo.webp";

const picture = (
  width: number,
  height: number,
  format: "png" | "jpeg" | "gif" = "png",
  background = { r: 200, g: 40, b: 90 },
) =>
  sharp({ create: { width, height, channels: 3, background } })
    .toFormat(format)
    .toBuffer();

// Two frames of different colours joined into one animated GIF.
const animation = async (width: number, height: number) =>
  sharp(
    await Promise.all([
      picture(width, height),
      picture(width, height, "png", { r: 10, g: 200, b: 30 }),
    ]),
    { join: { animated: true } },
  )
    .gif()
    .toBuffer();

const stored = () => vi.mocked(storeLogo).mock.calls[0];

describe("uploadLogo", () => {
  beforeEach(() => {
    vi.mocked(findLogoUrlByHash).mockResolvedValue(null);
    vi.mocked(storeLogo).mockResolvedValue(url);
  });

  it("crops a wide picture to a 512 pixel square webp, so every logo fills its frame", async () => {
    await uploadLogo(wallet, await picture(1200, 800));

    const [, bytes] = stored();
    const out = await sharp(bytes).metadata();

    expect(out.format).toBe("webp");
    expect([out.width, out.height]).toEqual([512, 512]);
  });

  it("crops a small picture to the square of its short side, and never enlarges it", async () => {
    await uploadLogo(wallet, await picture(300, 120));

    const out = await sharp(stored()[1]).metadata();

    expect([out.width, out.height]).toEqual([120, 120]);
  });

  it("keeps an animated GIF animated, cropping every frame to the same square", async () => {
    await uploadLogo(wallet, await animation(300, 200));

    const out = await sharp(stored()[1], { animated: true }).metadata();

    expect(out.format).toBe("webp");
    expect(out.pages).toBe(2);
    expect([out.width, out.pageHeight]).toEqual([200, 200]);
  });

  it("refuses a file that is not a picture, whatever it was named, and stores nothing", async () => {
    const refused = uploadLogo(wallet, Buffer.from("not a picture at all"));

    await expect(refused).rejects.toMatchObject({
      statusCode: 415,
      code: "LOGO_NOT_AN_IMAGE",
    });
    expect(storeLogo).not.toHaveBeenCalled();
  });

  it("refuses an SVG, which the decoder reads but which can carry script", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>',
    );

    await expect(uploadLogo(wallet, svg)).rejects.toMatchObject({
      code: "LOGO_NOT_AN_IMAGE",
    });
    expect(storeLogo).not.toHaveBeenCalled();
  });

  it("refuses a picture cut off halfway, whose header reads but whose pixels do not", async () => {
    const whole = await picture(400, 400, "jpeg");

    await expect(
      uploadLogo(wallet, whole.subarray(0, Math.floor(whole.length / 2))),
    ).rejects.toMatchObject({ code: "LOGO_NOT_AN_IMAGE" });
    expect(storeLogo).not.toHaveBeenCalled();
  });

  it("refuses a small file that describes a huge canvas, before decoding it", async () => {
    // One colour compresses to a few kilobytes, so the byte limit never sees it.
    const vast = await picture(6000, 6000);

    await expect(uploadLogo(wallet, vast)).rejects.toMatchObject({
      statusCode: 413,
      code: "LOGO_TOO_LARGE",
    });
    expect(storeLogo).not.toHaveBeenCalled();
  });

  it("stores the file under the SHA-256 of the bytes it stores", async () => {
    await uploadLogo(wallet, await picture(64, 64));

    const [hash, bytes] = stored();

    expect(hash).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("gives the same picture the same name, whoever sends it", async () => {
    const same = await picture(640, 480);

    await uploadLogo(wallet, same);
    await uploadLogo(other, same);

    const [first, second] = vi.mocked(storeLogo).mock.calls;

    expect(first[0]).toBe(second[0]);
  });

  it("answers with the logo already stored for a picture, and stores it no second time", async () => {
    vi.mocked(findLogoUrlByHash).mockResolvedValue("https://app.ufs.sh/f/earlier.webp");

    const logo = await uploadLogo(other, await picture(64, 64));

    expect(logo).toEqual({ url: "https://app.ufs.sh/f/earlier.webp" });
    expect(storeLogo).not.toHaveBeenCalled();
  });

  it("records every upload against the wallet that sent it, a repeated picture too", async () => {
    vi.mocked(findLogoUrlByHash).mockResolvedValue("https://app.ufs.sh/f/earlier.webp");

    await uploadLogo(other, await picture(64, 64));

    expect(recordLogoUpload).toHaveBeenCalledWith({
      wallet: other,
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      url: "https://app.ufs.sh/f/earlier.webp",
    });
  });

  it("records a new picture under the address the store gave it", async () => {
    const logo = await uploadLogo(wallet, await picture(64, 64));

    expect(logo).toEqual({ url });
    expect(recordLogoUpload).toHaveBeenCalledWith({
      wallet,
      hash: stored()[0],
      url,
    });
  });

  it("records nothing when the store fails, so no row points at a file that is not there", async () => {
    vi.mocked(storeLogo).mockRejectedValue(new LogoStoreUnreachableError("down"));

    await expect(uploadLogo(wallet, await picture(64, 64))).rejects.toBeInstanceOf(
      LogoStoreUnreachableError,
    );
    expect(recordLogoUpload).not.toHaveBeenCalled();
  });

  describe("decoding", () => {
    // Counts the files between reading their header and finishing their encode, which
    // is the span the slot guards. Installed after the pictures are made, so making
    // them is not counted.
    const watchDecodes = () => {
      const seen = { now: 0, most: 0 };
      const { metadata, toBuffer } = sharp.prototype;

      vi.spyOn(sharp.prototype, "metadata").mockImplementation(async function (
        this: Sharp,
      ) {
        seen.now += 1;
        seen.most = Math.max(seen.most, seen.now);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return metadata.call(this);
      });
      vi.spyOn(sharp.prototype, "toBuffer").mockImplementation(async function (
        this: Sharp,
      ) {
        try {
          return await toBuffer.call(this);
        } finally {
          seen.now -= 1;
        }
      } as never);

      return seen;
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("decodes at most DECODE_SLOTS files at once, and the rest wait their turn", async () => {
      const files = await Promise.all(Array.from({ length: 6 }, () => picture(64, 64)));
      const seen = watchDecodes();

      await Promise.all(files.map((file) => uploadLogo(wallet, file)));

      expect(seen.most).toBe(DECODE_SLOTS);
      expect(storeLogo).toHaveBeenCalledTimes(6);
    });

    it("frees a slot when a decode fails, so refused files never block the ones after", async () => {
      const refusals = Array.from({ length: DECODE_SLOTS + 1 }, () =>
        uploadLogo(wallet, Buffer.from("not a picture at all")).catch(() => null),
      );
      await Promise.all(refusals);

      await expect(uploadLogo(wallet, await picture(64, 64))).resolves.toEqual({ url });
    });
  });

  it("takes a jpeg and a gif as readily as a png", async () => {
    await uploadLogo(wallet, await picture(64, 64, "jpeg"));
    await uploadLogo(wallet, await picture(64, 64, "gif"));

    expect(storeLogo).toHaveBeenCalledTimes(2);
  });
});
