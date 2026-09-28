import { isAddress } from "viem";
import type { Address } from "viem";
import { z } from "zod";

// What an address a caller typed is, decided once. The capitals in an address are
// a checksum over every other character, so a mistyped address stops matching and
// viem can tell. That is the only typo protection an address carries.
//
// A Wallet does not come through here and should not. It arrives inside a signed
// SIWE message or inside a credential this backend minted, so the signature is
// what vouches for it and a checksum would add nothing. This is for the addresses
// a human sends us.
//
// The check runs before the transform on purpose. Lowercasing first throws away
// the capitals the check reads, so a mistyped address would sail through. Refine
// then transform, never the other way round.
//
// The result is lowercased because the agents table is keyed by the token, so one
// token has to be one key whatever casing a creator copied. Nothing downstream
// needs the original form: viem accepts either, and the chain client lowercases
// its own cache key.
export const chainAddress = z
  .string()
  .refine((value) => isAddress(value), "supply an address")
  .transform((value) => value.toLowerCase() as Address);
