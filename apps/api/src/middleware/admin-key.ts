import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "@/config/env";
import { ApiError } from "@/shared";

// The admin credential, and the only thing that stands between an AI Launchpad operator
// and an agent belonging to someone else. It travels in its own header rather than
// the authorization header, so no code path can read a creator's bearer credential
// as an admin key or the reverse. Every failure answers the same way, so a caller
// learns nothing from the shape of it.
//
// Holds no feature-specific value, so any route needing the admin surface mounts it
// unchanged. How an admin signs in beyond this key is undecided; replacing it later
// is this file and one configuration value.
const HEADER = "x-admin-key";
const REJECTION = "Supply a valid admin key to do that.";

// Both sides are hashed before the comparison so the buffers are always the same
// length. timingSafeEqual throws on a length mismatch, and the length it would
// throw on is the length of the secret, which is itself something not to leak.
const digest = (value: string) => createHash("sha256").update(value).digest();

const expected = digest(env.ADMIN_API_KEY);

export const adminKey: RequestHandler = (req, _res, next) => {
  const supplied = req.headers[HEADER];

  if (typeof supplied !== "string" || !timingSafeEqual(digest(supplied), expected)) {
    next(ApiError.unauthorized(REJECTION, "INVALID_ADMIN_KEY"));
    return;
  }

  next();
};
