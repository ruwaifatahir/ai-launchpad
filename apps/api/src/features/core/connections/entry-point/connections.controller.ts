import type { Request, Response } from "express";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { ApiError, sendCreated, sendOk, zParse } from "@/shared";
import {
  agreeConsentSchema,
  attestationSchema,
  callbackSchema,
  connectionParamsSchema,
} from "@/features/core/connections/domain/schema";
import {
  readConsentText,
  recordConsent,
} from "@/features/core/connections/domain/consent";
import { startHandshake } from "@/features/core/connections/domain/handshake";
import {
  linkAccount,
  type LinkOutcome,
} from "@/features/core/connections/domain/linking";
import { recordAttestation } from "@/features/core/connections/domain/attestation";
import { readConnection } from "@/features/core/connections/domain/inspection";
import { disconnectAccount } from "@/features/core/connections/domain/removal";

// Where the creator lands after X, at the first configured panel origin so the
// target and the CORS allowlist cannot drift apart. It carries the outcome and the
// token and nothing else: the panel reads the real state through an authenticated
// route, and the token is public.
const panelReturn = (outcome: Landing) => {
  const target = new URL("/connect/x", env.PANEL_ORIGINS[0]);

  target.searchParams.set("status", outcome.connected ? "success" : "failure");
  if (!outcome.connected) target.searchParams.set("reason", outcome.reason);
  if ("token" in outcome) target.searchParams.set("token", outcome.token);

  return target.toString();
};

// Every outcome the domain reaches, plus the one it never sees: a failure before
// the handshake was read, which names no token.
type Landing = LinkOutcome | { connected: false; reason: "error" };

// A return X did not shape, or a failure before the handshake was read. Neither
// names a token, and both still send the creator to a page rather than a JSON body.
const landingOnFailure = (cause: unknown): Landing => {
  if (cause instanceof ApiError && cause.statusCode < 500)
    logger.warn("return from x refused", { code: cause.code, message: cause.message });
  else logger.error("return from x failed", { cause });

  return { connected: false, reason: "error" };
};

export const postConsent = async (req: Request, res: Response) => {
  const { params, body } = await zParse(agreeConsentSchema, req);
  const data = await recordConsent(params, body, req.session.wallet);
  sendCreated(res, data);
};

export const getConsent = async (req: Request, res: Response) => {
  const { params } = await zParse(connectionParamsSchema, req);
  const data = await readConsentText(params);
  sendOk(res, data);
};

export const postAuthorization = async (req: Request, res: Response) => {
  const { params } = await zParse(connectionParamsSchema, req);
  const data = await startHandshake(params, req.session.wallet);
  sendCreated(res, data);
};

export const putAttestation = async (req: Request, res: Response) => {
  const { params } = await zParse(attestationSchema, req);
  const data = await recordAttestation(params);
  sendOk(res, data);
};

export const getConnection = async (req: Request, res: Response) => {
  const { params } = await zParse(connectionParamsSchema, req);
  const data = await readConnection(params);
  sendOk(res, data);
};

export const deleteConnection = async (req: Request, res: Response) => {
  const { params } = await zParse(connectionParamsSchema, req);
  const data = await disconnectAccount(params);
  sendOk(res, data);
};

// The creator's browser is on the other end, so every outcome is a redirect.
export const getCallback = async (req: Request, res: Response) => {
  const outcome = await zParse(callbackSchema, req)
    .then(({ query }) => linkAccount(query))
    .catch(landingOnFailure);

  res.redirect(panelReturn(outcome));
};
