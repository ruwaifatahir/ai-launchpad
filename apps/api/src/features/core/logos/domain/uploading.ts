import { createHash } from "node:crypto";
import sharp from "sharp";
import { storeLogo } from "@/lib/logo-store/client";
import { findLogoUrlByHash, recordLogoUpload } from "@/features/core/logos/logos.repo";
import { MAX_PIXELS, logoNotAnImage, logoTooLarge } from "@/features/core/logos/refusals";

const SIDE = 512;

// What the panel's picker offers. The decoder reads more than this, SVG among it,
// and an SVG can carry script, so the format is checked against the bytes rather
// than trusted from the name or the declared type.
const FORMATS = new Set(["png", "jpeg", "webp", "gif"]);

// Checks the file is a picture this route takes, and turns it into the WebP square
// that is stored.
const toStoredLogo = async (file: Buffer) => {
  // Reading the header decodes no pixels, so it runs without the pixel limit. With
  // it, a canvas over the limit would fail here as unreadable rather than too large.
  const header = await sharp(file, { animated: true, limitInputPixels: false })
    .metadata()
    .catch(() => {
      throw logoNotAnImage();
    });
  const { format, width = 0, pageHeight, height = 0 } = header;

  if (!FORMATS.has(format)) throw logoNotAnImage();

  // Checked from the header, so the refusal names the real reason. The decoder below
  // enforces the same limit on its own, which only backs this up.
  if (width * height > MAX_PIXELS) throw logoTooLarge();

  // Every frame, so an animation stays one. Turned upright from its EXIF orientation
  // before cropping, because the stored logo carries no metadata to turn it later.
  const image = sharp(file, {
    animated: true,
    autoOrient: true,
    limitInputPixels: MAX_PIXELS,
  });

  // An animation reads as its frames stacked, so a frame's height is the page height.
  const side = Math.min(SIDE, width, pageHeight ?? height);

  // A header can read while the pixels behind it are cut off or corrupt, which only
  // decoding finds. That is still the file's fault, never the server's.
  return image
    .resize(side, side, { fit: "cover" })
    .webp()
    .toBuffer()
    .catch(() => {
      throw logoNotAnImage();
    });
};

// How many files may be decoded at once, across every caller. A decode can hold up
// to MAX_PIXELS in memory, and sharp works on Node's small shared thread pool, which
// also resolves every host name the process connects to. Past this many, an upload
// waits its turn rather than slowing every other route.
export const DECODE_SLOTS = 2;

let decoding = 0;
const waiting: (() => void)[] = [];

// Runs work once a slot is free, and frees it after, whether the work failed or not.
// A slot is handed straight to the next in line, so a newcomer never jumps the queue.
const inDecodeSlot = async <T>(work: () => Promise<T>): Promise<T> => {
  if (decoding < DECODE_SLOTS) decoding += 1;
  else await new Promise<void>((resolve) => waiting.push(resolve));

  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else decoding -= 1;
  }
};

export const uploadLogo = async (wallet: string, file: Buffer) => {
  const bytes = await inDecodeSlot(() => toStoredLogo(file));

  // Named after what is stored rather than what was sent, so the same file is always
  // the same logo, and one already stored is answered from its record. An encoder
  // upgrade that changes the bytes stores a second copy, which costs space and
  // breaks no address already given.
  const hash = createHash("sha256").update(bytes).digest("hex");
  const url = (await findLogoUrlByHash(hash)) ?? (await storeLogo(hash, bytes));

  // After the store, so a failed store leaves no row pointing at nothing. A repeated
  // file is recorded too, because the record is of who sent what.
  await recordLogoUpload({ wallet, hash, url });

  return { url };
};
