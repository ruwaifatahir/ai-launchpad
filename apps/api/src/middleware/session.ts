import type { RequestHandler } from "express";
import { ApiError } from "@/shared";
import { readCredential } from "@/lib/credential";

// Resolves the bearer credential to a wallet address in process: no store read and
// no network call, so a protected request costs nothing beyond this check. Every
// failure answers the same way, so a caller learns nothing from the shape of it.
//
// The bearer scheme is read here rather than in src/lib/credential, because the
// scheme is HTTP and that module is not.
const REJECTION = "Sign in with your wallet to do that.";

// The scheme name is case insensitive (RFC 9110), the credential is not. A header
// longer than any credential this backend mints is refused before it is parsed.
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)$/i;
const HEADER_MAX = 2048;

export const session: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const match =
    typeof header === "string" && header.length <= HEADER_MAX
      ? BEARER.exec(header)
      : null;

  if (!match) {
    next(ApiError.unauthorized(REJECTION));
    return;
  }

  readCredential(match[1])
    .then((wallet) => {
      if (!wallet) {
        next(ApiError.unauthorized(REJECTION));
        return;
      }

      req.session = { wallet };
      next();
    })
    .catch(next);
};
