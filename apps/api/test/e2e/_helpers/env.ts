import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "@/config/env";

// Shared by every e2e suite. Nothing here is mocked: this is the real env module
// reading the real .env, so a variable the suite needs and does not have has to
// fail loudly and by name rather than surface later as an unrelated assertion.

const REQUIRED = [
  "REDIS_URL",
  "CHAIN_ID",
  "RPC_URL",
  "PANEL_ORIGINS",
  "JWT_SECRET",
] as const;

const missing = REQUIRED.filter((name) => {
  const value = env[name];
  return (
    value === undefined || value === "" || (Array.isArray(value) && value.length === 0)
  );
});

if (missing.length > 0)
  throw new Error(
    `The e2e suite reads ${missing.join(", ")} out of .env and found nothing there. ` +
      `Fill in .env before running pnpm test:e2e.`,
  );

// A test identity is the subject of a session credential, so it is a wallet. The
// key is derived from a label rather than read from .env: it is fixed, which keeps
// a run reproducible, and it is not a secret, because it holds nothing and never
// signs a transaction. Only messages.
export const identity = (label: string) =>
  privateKeyToAccount(keccak256(toHex(`ai-launchpad e2e ${label}`)));

// The one origin the backend accepts a signature for, split the way the SIWE
// domain check in the verification domain splits it.
export const panelUri = env.PANEL_ORIGINS[0];
export const panelDomain = new URL(panelUri).host;
