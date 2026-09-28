/** The four parts of a Persona, in the order the Creator writes them. */
export const PERSONA_PARTS = ['name', 'personality', 'lore', 'style'] as const;
export type PersonaPart = (typeof PERSONA_PARTS)[number];

/** A token's Agent, as `GET /api/v1/core/agents/{token}` sends it. */
export type Agent = {
  /** Lowercase address: the token, and the Agent's only identifier. */
  token: string;
  name: string | null;
  personality: string | null;
  lore: string | null;
  style: string | null;
  topics: string[];
  /** Posts a day, 1 to 5. */
  pace: number;
  /** ISO 8601: when the Creator Paused it. */
  pausedAt: string | null;
  /** ISO 8601: when an API admin Stopped it. */
  stoppedAt: string | null;
  /** ISO 8601: when the token's Pool opened, so the Agent Unlocked. `null` while Locked. */
  graduatedAt: string | null;
};

/** Whether all four Persona parts are written. */
export const personaComplete = (agent: Pick<Agent, PersonaPart>): boolean =>
  PERSONA_PARTS.every((part) => agent[part] !== null);

/** The body of `PATCH /api/v1/core/agents/{token}`: only what changes. `null` clears a Persona part. */
export type AgentEdit = Partial<Pick<Agent, PersonaPart | 'topics' | 'pace'>>;
