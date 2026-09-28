import { describe, expect, it } from "vitest";

import { findLogoUrlByHash, recordLogoUpload } from "@/features/core/logos/logos.repo";
import { prismaMock } from "@test/helpers/prisma.mock";

const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const hash = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const url = `https://app.ufs.sh/f/${hash}.webp`;

describe("logos.repo", () => {
  it("findLogoUrlByHash answers with the address a stored file was given", async () => {
    prismaMock.logoUpload.findFirst.mockResolvedValue({ url });

    expect(await findLogoUrlByHash(hash)).toBe(url);
    expect(prismaMock.logoUpload.findFirst).toHaveBeenCalledWith({
      where: { hash },
      select: { url: true },
    });
  });

  it("findLogoUrlByHash answers null for a file never stored, so the caller stores it", async () => {
    prismaMock.logoUpload.findFirst.mockResolvedValue(null);

    expect(await findLogoUrlByHash(hash)).toBeNull();
  });

  it("recordLogoUpload writes the wallet, the hash and the address, and nothing else", async () => {
    await recordLogoUpload({ wallet, hash, url });

    expect(prismaMock.logoUpload.create).toHaveBeenCalledWith({
      data: { wallet, hash, url },
    });
  });
});
