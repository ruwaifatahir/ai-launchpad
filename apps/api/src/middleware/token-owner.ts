import type { RequestHandler } from "express";
import { isAddressEqual } from "viem";
import { ApiError } from "@/shared";
import { chainAddress } from "@/lib/chain/address";
import { readTokenCreator } from "@/lib/chain/client";

// Identity is not access. The session names a wallet; the chain decides what that
// wallet owns. Parameterised by the path parameter holding the token address, so
// this file carries no route of its own.
//
// Mount it after src/middleware/session.ts, which is what sets req.session.
//
// A chain failure is forwarded rather than translated. src/lib/chain names what went
// wrong and src/shared/middleware/error-handler.ts decides what a caller is told, so
// nothing here has to guess that every unreadable chain means the same thing.
export const tokenOwner =
  (param: string): RequestHandler =>
  (req, _res, next) => {
    const parsed = chainAddress.safeParse(req.params[param]);

    if (!parsed.success) {
      next(ApiError.badRequest("Supply a token address.", "INVALID_TOKEN_ADDRESS"));
      return;
    }

    readTokenCreator(parsed.data)
      .then((creator) => {
        if (!creator)
          throw ApiError.notFound("No token at that address.", "TOKEN_NOT_FOUND");

        if (!isAddressEqual(creator, req.session.wallet))
          throw ApiError.forbidden(
            "That token belongs to another creator.",
            "NOT_TOKEN_CREATOR",
          );

        next();
      })
      .catch(next);
  };
