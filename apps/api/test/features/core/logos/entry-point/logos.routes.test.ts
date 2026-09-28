import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Only the store is mocked, and the database through the shared Prisma mock. The
// session middleware, the multipart parser and the picture checks all run, because
// their refusals are the contract this route publishes.
vi.mock("@/lib/logo-store/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logo-store/client")>()),
  storeLogo: vi.fn(),
}));

import app from "@/app";
import { mintCredential } from "@/lib/credential";
import { LogoStoreUnreachableError, storeLogo } from "@/lib/logo-store/client";
import { prismaMock } from "@test/helpers/prisma.mock";

const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const url = "https://app.ufs.sh/f/logo.webp";

const picture = (width = 64, height = 64) =>
  sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } },
  })
    .png()
    .toBuffer();

const send = async (file: Buffer, name = "logo.png", field = "file") =>
  request(app)
    .post("/api/v1/core/logos")
    .set("Authorization", `Bearer ${await mintCredential(wallet)}`)
    .attach(field, file, name);

describe("POST /api/v1/core/logos", () => {
  beforeEach(() => {
    vi.mocked(storeLogo).mockResolvedValue(url);
    prismaMock.logoUpload.findFirst.mockResolvedValue(null);
    prismaMock.logoUpload.create.mockResolvedValue({});
  });

  it("answers 201 with the logo's address in the shared envelope", async () => {
    const res = await send(await picture());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ url });
  });

  it("records the upload against the session wallet", async () => {
    await send(await picture());

    expect(prismaMock.logoUpload.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ wallet, url }),
    });
  });

  it("answers 401 without a credential, and reads no file", async () => {
    const res = await request(app)
      .post("/api/v1/core/logos")
      .attach("file", await picture(), "logo.png");

    expect(res.status).toBe(401);
    expect(storeLogo).not.toHaveBeenCalled();
  });

  it("answers 400 LOGO_REQUIRED to a body that is not multipart", async () => {
    const res = await request(app)
      .post("/api/v1/core/logos")
      .set("Authorization", `Bearer ${await mintCredential(wallet)}`)
      .send({ url: "https://example.com/logo.png" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LOGO_REQUIRED");
  });

  it("answers 400 LOGO_REQUIRED to a file under another field name", async () => {
    const res = await send(await picture(), "logo.png", "image");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LOGO_REQUIRED");
  });

  it("answers 400 LOGO_REQUIRED to two files", async () => {
    const res = await request(app)
      .post("/api/v1/core/logos")
      .set("Authorization", `Bearer ${await mintCredential(wallet)}`)
      .attach("file", await picture(), "one.png")
      .attach("file", await picture(), "two.png");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LOGO_REQUIRED");
    expect(storeLogo).not.toHaveBeenCalled();
  });

  it("answers 413 LOGO_TOO_LARGE to a file over 4 MB, before decoding it", async () => {
    const res = await send(Buffer.alloc(4 * 1024 * 1024 + 1, 1), "big.png");

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("LOGO_TOO_LARGE");
  });

  it("answers 415 LOGO_NOT_AN_IMAGE to a file named like a picture that is not one", async () => {
    const res = await send(Buffer.from("<script>alert(1)</script>"), "logo.png");

    expect(res.status).toBe(415);
    expect(res.body.code).toBe("LOGO_NOT_AN_IMAGE");
  });

  it("answers 503 LOGO_STORE_UNAVAILABLE when the store is down, and records nothing", async () => {
    vi.mocked(storeLogo).mockRejectedValue(new LogoStoreUnreachableError("down"));

    const res = await send(await picture());

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("LOGO_STORE_UNAVAILABLE");
    expect(prismaMock.logoUpload.create).not.toHaveBeenCalled();
  });
});
