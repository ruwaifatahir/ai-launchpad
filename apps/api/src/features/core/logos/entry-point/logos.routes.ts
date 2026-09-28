import { Router, type RequestHandler } from "express";
import multer from "multer";
import { session } from "@/middleware/session";
import { logoIpLimiter, logoLimiter } from "@/features/core/logos/limiter";
import { postLogo } from "@/features/core/logos/entry-point/logos.controller";
import { MAX_BYTES, logoRequired, logoTooLarge } from "@/features/core/logos/refusals";

const router = Router();

// Held in memory rather than on disk, because the file is decoded straight from the
// buffer and the process writes nothing to disk at runtime. The byte limit is what
// keeps that safe: the parser stops reading at 4 MB and never buffers more.
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 0 },
}).single("file");

// multer's own code for a file over the byte limit, never one this API sends. A
// template literal, so the check that every quoted code is documented passes it by.
const OVER_LIMIT: multer.ErrorCode = `LIMIT_FILE_SIZE`;

// The parser's failures become this API's shape here, beside the one route that
// parses multipart, rather than in the shared handler every JSON route passes. A
// failure of the store is mapped there instead, because src/lib names it and every
// lib failure becomes a response in that one place.
const logoFile: RequestHandler = (req, res, next) => {
  parser(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError && err.code === OVER_LIMIT) {
      next(logoTooLarge());
      return;
    }

    // A second file, a text field, a file under another name, or a body cut off
    // mid part. All of them are a request that is not the one this route takes.
    next(logoRequired());
  });
};

/**
 * @openapi
 * /api/v1/core/logos:
 *   post:
 *     tags: [Logos]
 *     operationId: uploadLogo
 *     summary: Store a file as a token's logo, and answer with its address
 *     description: >
 *       Uploaded before the launch, so the address can be written on chain with it.
 *       The launch may never come, so any signed in wallet may upload, and a logo
 *       no token uses is kept like any other.
 *
 *
 *       The file is checked against its bytes, never its name or declared type,
 *       and must be a PNG, JPEG, WebP or GIF. It is cropped from the centre to a
 *       square, at most 512 pixels a side and never enlarged, and stored as WebP with
 *       its metadata removed. An animated GIF or WebP stays animated.
 *
 *
 *       The same file is always the same logo. Uploading one already stored
 *       answers with the address it already has, so the address is safe to write on
 *       chain more than once.
 *
 *
 *       Every upload is recorded against the session wallet, a repeated file
 *       too, so an admin removing an abusive logo can tell who sent it.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file, at most 4 MB. The only part the body may carry.
 *     responses:
 *       201:
 *         description: >
 *           The address the logo is served from, which is what the launch writes on
 *           chain. It never changes and is well under the 512 bytes the launchpad
 *           takes.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LogoResponse'
 *       400:
 *         description: >
 *           No file, more than one, a file under another field name, a text field, or
 *           a body that is not multipart form data. The code is LOGO_REQUIRED.
 *       401:
 *         description: No credential, a tampered one, or one older than seven days
 *       413:
 *         description: >
 *           A file over 4 MB, or one over 25 million pixels, frames included.
 *           The code is LOGO_TOO_LARGE.
 *       415:
 *         description: >
 *           A file that is not a PNG, JPEG, WebP or GIF, or one whose pixels do not
 *           decode. An SVG is refused here. The code is LOGO_NOT_AN_IMAGE.
 *       429:
 *         description: >
 *           Ten uploads an hour per session wallet, and thirty an hour per IP whatever
 *           wallet signed in
 *       503:
 *         description: >
 *           The logo store could not be reached. Nothing was recorded, so the same
 *           request is worth repeating.
 */
router.post("/logos", session, logoLimiter, logoIpLimiter, logoFile, postLogo);

export default router;
