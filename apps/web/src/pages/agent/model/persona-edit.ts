import { PERSONA_PARTS, type Agent, type AgentEdit } from '@/entities/agent';
import { PACE_RANGE, PERSONA_LIMITS, TOPIC_LIMITS } from '../config/persona-limits';

/** The Persona form as the Creator types it: an unwritten part is empty text. */
export type PersonaForm = {
  name: string;
  personality: string;
  lore: string;
  style: string;
  topics: string[];
  pace: number;
};

export type PersonaErrors = Partial<Record<keyof PersonaForm, string>>;

export type PersonaEdit = {
  /** The PATCH body, or `null` when the form changes nothing. */
  body: AgentEdit | null;
  /** Why a field cannot be saved, beside it. Save waits until there are none. */
  errors: PersonaErrors;
  /** Saving clears a Persona part of an Agent that could otherwise post, so the Creator confirms first. */
  clearsLivePart: boolean;
};

/** The form filled from the saved Agent. */
export function personaForm(agent: Agent): PersonaForm {
  return {
    name: agent.name ?? '',
    personality: agent.personality ?? '',
    lore: agent.lore ?? '',
    style: agent.style ?? '',
    topics: agent.topics,
    pace: agent.pace,
  };
}

const count = new Intl.NumberFormat('en-US');

/** Compares the form with the saved Agent and builds the PATCH body, refusing what the backend would. */
export function personaEdit(agent: Agent, form: PersonaForm): PersonaEdit {
  const body: AgentEdit = {};
  const errors: PersonaErrors = {};

  for (const part of PERSONA_PARTS) {
    const trimmed = form[part].trim();
    // The backend counts the trimmed text in UTF-16 units, as `length` does.
    if (trimmed.length > PERSONA_LIMITS[part]) {
      errors[part] = `Keep it to ${count.format(PERSONA_LIMITS[part])} characters`;
    } else if (trimmed === '' && form[part] !== '') {
      errors[part] = 'Write something, or clear the field';
    }
    // An emptied part clears it.
    const value = trimmed || null;
    if (value !== agent[part]) body[part] = value;
  }

  // Topics are set whole: the full list goes, in order, or `[]` to clear them.
  const topics = form.topics.map((topic) => topic.trim());
  if (topics.length > TOPIC_LIMITS.count) errors.topics = `Keep to ${TOPIC_LIMITS.count} topics`;
  else if (topics.some((topic) => topic.length > TOPIC_LIMITS.length)) {
    errors.topics = `Keep each topic to ${TOPIC_LIMITS.length} characters`;
  } else if (topics.includes('')) errors.topics = 'Remove the empty topic';
  const topicsChanged =
    topics.length !== agent.topics.length || topics.some((topic, index) => topic !== agent.topics[index]);
  if (topicsChanged) body.topics = topics;

  if (!Number.isInteger(form.pace) || form.pace < PACE_RANGE.min || form.pace > PACE_RANGE.max) {
    errors.pace = `Pick ${PACE_RANGE.min} to ${PACE_RANGE.max} posts a day`;
  }
  if (form.pace !== agent.pace) body.pace = form.pace;

  // Only an Agent that could otherwise post loses anything; a Locked, Paused or Stopped one publishes nothing.
  const live = agent.graduatedAt !== null && agent.pausedAt === null && agent.stoppedAt === null;
  const clearsPart = PERSONA_PARTS.some((part) => body[part] === null);

  return { body: Object.keys(body).length > 0 ? body : null, errors, clearsLivePart: live && clearsPart };
}
