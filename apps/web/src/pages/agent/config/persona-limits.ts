import type { PersonaPart } from '@/entities/agent';

/** The longest each Persona part may be once trimmed, as the backend counts it. */
export const PERSONA_LIMITS: Record<PersonaPart, number> = {
  name: 40,
  personality: 1000,
  lore: 2000,
  style: 500,
};

export const TOPIC_LIMITS = { count: 10, length: 60 } as const;

export const PACE_RANGE = { min: 1, max: 5 } as const;
