export interface Persona {
  name: string;
  personality: string;
  lore: string;
  style: string;
}

type PersonaParts = { [Part in keyof Persona]: string | null };

export const hasCompletePersona = <Agent extends PersonaParts>(
  agent: Agent | null | undefined,
): agent is Agent & Persona =>
  Boolean(agent?.name && agent.personality && agent.lore && agent.style);
