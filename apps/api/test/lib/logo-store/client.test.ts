import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// UploadThing's client and the network are mocked. What is under test is what the
// store makes of their answers: the address it builds, and when a refused upload is
// still a stored logo.
const { uploadFiles } = vi.hoisted(() => ({ uploadFiles: vi.fn() }));

vi.mock("uploadthing/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("uploadthing/server")>()),
  UTApi: vi.fn(function () {
    return { uploadFiles };
  }),
}));

import { LogoStoreUnreachableError, storeLogo } from "@/lib/logo-store/client";

const hash = "a".repeat(64);
const bytes = Buffer.from("webp bytes");

// The app id comes from the env mock, already read out of the token.
const address = `https://testapp.ufs.sh/f/${hash}.webp`;

const fetchMock = vi.fn();

const served = (ok: boolean) =>
  fetchMock.mockResolvedValue(new Response(null, { status: ok ? 200 : 404 }));

describe("storeLogo", () => {
  beforeEach(() => {
    uploadFiles.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers with the address built from the app id and the hash", async () => {
    uploadFiles.mockResolvedValue({ data: {}, error: null });

    await expect(storeLogo(hash, bytes)).resolves.toBe(address);
  });

  it("uploads the file under its hash as a custom id, so the address follows from the hash alone", async () => {
    uploadFiles.mockResolvedValue({ data: {}, error: null });

    await storeLogo(hash, bytes);

    const [file] = uploadFiles.mock.calls[0];
    expect(file.name).toBe(`${hash}.webp`);
    expect(file.customId).toBe(`${hash}.webp`);
    expect(file.type).toBe("image/webp");
  });

  it("gives the upload a deadline, so a stalled store cannot hold the request open", async () => {
    uploadFiles.mockResolvedValue({ data: {}, error: null });

    await storeLogo(hash, bytes);

    const [, options] = uploadFiles.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not check the address after an upload that succeeded", async () => {
    uploadFiles.mockResolvedValue({ data: {}, error: null });

    await storeLogo(hash, bytes);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers with the address when the upload is refused but the file is served, as when two requests race", async () => {
    uploadFiles.mockResolvedValue({ data: null, error: { code: "BAD_REQUEST" } });
    served(true);

    await expect(storeLogo(hash, bytes)).resolves.toBe(address);
    expect(fetchMock).toHaveBeenCalledWith(
      address,
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("fails as unreachable when the upload is refused and nothing is served", async () => {
    uploadFiles.mockResolvedValue({
      data: null,
      error: { code: "INTERNAL_SERVER_ERROR" },
    });
    served(false);

    await expect(storeLogo(hash, bytes)).rejects.toBeInstanceOf(
      LogoStoreUnreachableError,
    );
  });

  it("fails as unreachable when the upload throws, a timeout among it, and nothing is served", async () => {
    uploadFiles.mockRejectedValue(new Error("The operation was aborted due to timeout"));
    served(false);

    await expect(storeLogo(hash, bytes)).rejects.toBeInstanceOf(
      LogoStoreUnreachableError,
    );
  });

  it("fails as unreachable when the check for a served file cannot reach the store either", async () => {
    uploadFiles.mockRejectedValue(new Error("fetch failed"));
    fetchMock.mockRejectedValue(new Error("fetch failed"));

    await expect(storeLogo(hash, bytes)).rejects.toBeInstanceOf(
      LogoStoreUnreachableError,
    );
  });

  it("keeps what the store said as the failure's cause, so the log names it", async () => {
    const cause = { code: "INTERNAL_SERVER_ERROR" };
    uploadFiles.mockResolvedValue({ data: null, error: cause });
    served(false);

    await expect(storeLogo(hash, bytes)).rejects.toMatchObject({ cause });
  });
});
