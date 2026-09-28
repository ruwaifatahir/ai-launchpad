/** The one step left before an Agent may post to X, or `null` once Consent, Authorization and Attestation are all done. */
export type ConnectionGate = 'consent' | 'authorization' | 'attestation' | null;

/** A token's X connection, as `GET /api/v1/core/connections/{token}` sends it. */
export type XConnection = {
  token: string;
  /** The handle when the account connected. The API never refreshes it. */
  xUsername: string | null;
  /** ISO 8601: when the Creator gave their Attestation. */
  confirmedAt: string | null;
  outstandingGate: ConnectionGate;
  /** The Creator agreed once but holds no X account now: "Connect X again", not "Connect X". */
  disconnected: boolean;
};

/** The Consent wording the API serves. Rendered as sent, in order: the panel writes none of it. */
export type ConsentText = {
  token: string;
  /** Sent back when the Creator agrees. */
  version: number;
  title: string;
  sections: { heading: string; points: string[] }[];
};
