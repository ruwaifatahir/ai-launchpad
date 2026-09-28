import type { Address } from "viem";
import { ApiError } from "@/shared";
import { logger } from "@/lib/logger";
import { requireGraduation } from "@/features/core/connections/domain/graduation";
import {
  createConsent,
  findLatestConsentByToken,
} from "@/features/core/connections/data-model/connections.repo";
import type {
  AgreeConsentInput,
  ConnectionParams,
} from "@/features/core/connections/domain/schema";

const CONSENT_VERSION = 1;

const CONSENT_TITLE = "What your agent will do on your X account";

const CONSENT_SECTIONS = [
  {
    heading: "What your agent does",
    points: [
      "It publishes original text posts to the X account you connect.",
      "It posts on the schedule you set, up to five posts a day.",
      "It writes every post itself with AI, from the persona and the topics you wrote.",
      "Nobody reads a post before it goes out. Not you, and nobody at AI Launchpad.",
      "It keeps posting until you pause it, you disconnect it, or an AI Launchpad admin stops it.",
    ],
  },
  {
    heading: "What your agent never does",
    points: [
      "It never replies to anyone, not even to a comment on its own post.",
      "It never likes a post.",
      "It never follows an account.",
      "It never quotes a post.",
      "It never names another account in a post.",
      "It never posts an image.",
      "It never posts a link.",
    ],
  },
  {
    heading: "What the permission X asks for covers",
    points: [
      "X asks for the permission on its own screen next, and it is wider than what your agent uses.",
      "X does not offer posting without reading, so the permission includes reading posts your account can see.",
      "Your agent reads nothing. It publishes, it confirms which account connected, and it stays connected.",
      "AI Launchpad asks for no permission to like, to follow or to quote.",
    ],
  },
  {
    heading: "What you do by hand on X",
    points: [
      "You turn on X's automated label on the account. Only the account owner can, so AI Launchpad cannot do it for you.",
      "You link a human account from the bio, so a reader can reach a person.",
      "You tell AI Launchpad when both are done. AI Launchpad cannot check either one and takes your word.",
    ],
  },
];

export const readConsentState = async (token: Address) => {
  const consent = await findLatestConsentByToken(token);

  return {
    agreed: consent !== null,
    current: consent !== null && consent.version >= CONSENT_VERSION,
  };
};

export const requireCurrentConsent = async (token: Address) => {
  const { agreed, current } = await readConsentState(token);

  if (!agreed)
    throw ApiError.conflict(
      "Agree to the list of automated actions your agent will take before connecting an X account.",
      "CONSENT_REQUIRED",
    );

  if (!current)
    throw ApiError.conflict(
      "The list of automated actions has changed since you agreed to it. Read it again and agree to the current version, then connect your X account.",
      "CONSENT_OUTDATED",
    );
};

export const recordConsent = async (
  params: ConnectionParams,
  input: AgreeConsentInput,
  wallet: Address,
) => {
  await requireGraduation(params.token);

  if (input.version !== CONSENT_VERSION)
    throw ApiError.conflict(
      "This agreement has changed since you opened it. Read it again, then agree to the version you were shown.",
      "CONSENT_VERSION_MISMATCH",
    );

  const consent = await createConsent(params.token, { wallet, version: input.version });

  logger.info("consent recorded", { token: consent.token, version: consent.version });

  return { token: consent.token, version: consent.version, agreedAt: consent.agreedAt };
};

export const readConsentText = async (params: ConnectionParams) => {
  await requireGraduation(params.token);

  return {
    token: params.token,
    version: CONSENT_VERSION,
    title: CONSENT_TITLE,
    sections: CONSENT_SECTIONS,
  };
};
