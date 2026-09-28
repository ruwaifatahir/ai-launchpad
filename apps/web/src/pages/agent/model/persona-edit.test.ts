import { describe, expect, it } from 'vitest';
import type { Agent } from '@/entities/agent';
import { personaEdit, personaForm, type PersonaForm } from './persona-edit';

const WHEN = '2026-09-19T11:06:02.400Z';

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  token: '0x1234567890abcdef1234567890abcdef12345678',
  name: 'Nova',
  personality: 'Dry, precise, never breathless.',
  lore: 'Born the day the curve closed.',
  style: 'Short sentences. No emoji.',
  topics: ['market structure', 'tokenized equities'],
  pace: 3,
  pausedAt: null,
  stoppedAt: null,
  graduatedAt: WHEN,
  ...overrides,
});

const edit = (form: Partial<PersonaForm>, saved: Partial<Agent> = {}) =>
  personaEdit(agent(saved), { ...personaForm(agent(saved)), ...form });

describe('personaEdit', () => {
  it('gives no body for a form that changes nothing, so an empty edit is never sent', () => {
    expect(edit({})).toEqual({ body: null, errors: {}, clearsLivePart: false });
  });

  it('sends only the fields that changed, trimmed', () => {
    expect(edit({ name: '  Vega ', pace: 5 }).body).toEqual({ name: 'Vega', pace: 5 });
  });

  it('treats a change of surrounding spaces alone as no change', () => {
    expect(edit({ lore: 'Born the day the curve closed. ' }).body).toBeNull();
  });

  it('sends a cleared Persona part as null, and a first write of an unwritten one as text', () => {
    expect(edit({ lore: '' }).body).toEqual({ lore: null });
    expect(edit({ style: 'Terse.' }, { style: null }).body).toEqual({ style: 'Terse.' });
  });

  it('sends Topics whole when any changed, trimmed, and an empty list to clear them, never null', () => {
    expect(edit({ topics: ['market structure', ' tokenized equities', 'rates '] }).body).toEqual({
      topics: ['market structure', 'tokenized equities', 'rates'],
    });
    expect(edit({ topics: [] }).body).toEqual({ topics: [] });
    expect(edit({ topics: ['tokenized equities', 'market structure'] }).body).toEqual({
      topics: ['tokenized equities', 'market structure'],
    });
    expect(edit({ topics: ['market structure ', 'tokenized equities'] }).body).toBeNull();
  });

  it('refuses each Persona part past its limit once trimmed, and takes one at its limit', () => {
    expect(edit({ name: 'a'.repeat(41) }).errors).toEqual({ name: 'Keep it to 40 characters' });
    expect(edit({ name: ` ${'a'.repeat(40)} ` }).errors).toEqual({});
    expect(edit({ personality: 'a'.repeat(1001) }).errors).toEqual({ personality: 'Keep it to 1,000 characters' });
    expect(edit({ lore: 'a'.repeat(2001) }).errors).toEqual({ lore: 'Keep it to 2,000 characters' });
    expect(edit({ style: 'a'.repeat(501) }).errors).toEqual({ style: 'Keep it to 500 characters' });
  });

  it('refuses a part of spaces alone, which is neither written nor cleared', () => {
    expect(edit({ lore: '   ' }).errors).toEqual({ lore: 'Write something, or clear the field' });
  });

  it('refuses an eleventh Topic, a Topic past 60 characters and a blank one', () => {
    const ten = Array.from({ length: 10 }, (_, index) => `topic ${index}`);
    expect(edit({ topics: ten }).errors).toEqual({});
    expect(edit({ topics: [...ten, 'one more'] }).errors).toEqual({ topics: 'Keep to 10 topics' });
    expect(edit({ topics: ['a'.repeat(61)] }).errors).toEqual({ topics: 'Keep each topic to 60 characters' });
    expect(edit({ topics: ['rates', ' '] }).errors).toEqual({ topics: 'Remove the empty topic' });
  });

  it('refuses a Pace outside 1 to 5 posts a day', () => {
    expect(edit({ pace: 0 }).errors).toEqual({ pace: 'Pick 1 to 5 posts a day' });
    expect(edit({ pace: 6 }).errors).toEqual({ pace: 'Pick 1 to 5 posts a day' });
    expect(edit({ pace: 2.5 }).errors).toEqual({ pace: 'Pick 1 to 5 posts a day' });
  });

  it('warns before clearing a Persona part of an Unlocked Agent that is neither Paused nor Stopped', () => {
    expect(edit({ lore: '' }).clearsLivePart).toBe(true);
    expect(edit({ lore: '', name: 'Vega' }).clearsLivePart).toBe(true);
  });

  it('does not warn when nothing is cleared, or when the Agent could not post anyway', () => {
    expect(edit({ name: 'Vega', topics: [] }).clearsLivePart).toBe(false);
    expect(edit({ lore: '' }, { graduatedAt: null }).clearsLivePart).toBe(false);
    expect(edit({ lore: '' }, { pausedAt: WHEN }).clearsLivePart).toBe(false);
    expect(edit({ lore: '' }, { stoppedAt: WHEN }).clearsLivePart).toBe(false);
    expect(edit({ lore: '' }, { lore: null }).clearsLivePart).toBe(false);
  });
});
