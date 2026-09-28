import { ApiError } from "@/shared";

// Every refusal the logo route sends, in one place, because the parser refuses some
// of them and the domain the rest, and a caller should read one sentence per code
// whichever layer caught it.

export const MAX_BYTES = 4 * 1024 * 1024;

// Width times height across every frame. The byte limit alone does not bound the
// decode, because a small file can describe a huge canvas.
export const MAX_PIXELS = 25_000_000;

export const logoRequired = () =>
  ApiError.badRequest(
    "Send one file, as multipart form data in a field named file.",
    "LOGO_REQUIRED",
  );

export const logoTooLarge = () =>
  new ApiError(
    413,
    "That file is too large. A logo is at most 4 MB and 25 million pixels, counting every frame.",
    { code: "LOGO_TOO_LARGE" },
  );

export const logoNotAnImage = () =>
  new ApiError(415, "That file is not a PNG, JPEG, WebP or GIF that decodes.", {
    code: "LOGO_NOT_AN_IMAGE",
  });
