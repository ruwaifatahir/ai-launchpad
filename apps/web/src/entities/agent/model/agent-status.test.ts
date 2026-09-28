import { describe, expect, it } from 'vitest';
import type { Agent } from './agent';
import { agentStatus } from './agent-status';
import type { XConnection } from './x-connection';

const WHEN = '2026-09-19T11:06:02.400Z';

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  token: '0x1234567890abcdef1234567890abcdef12345678',
  name: 'Nova',
  personality: 'Dry, precise, never breathless.',
  lore: 'Born the day the curve closed.',
  style: 'Short sentences. No emoji.',
  topics: ['market structure'],
  pace: 3,
  pausedAt: null,
  stoppedAt: null,
  graduatedAt: WHEN,
  ...overrides,
});

const connection = (overrides: Partial<XConnection> = {}): XConnection => ({
  token: '0x1234567890abcdef1234567890abcdef12345678',
  xUsername: 'novaonchain',
  confirmedAt: WHEN,
  outstandingGate: null,
  disconnected: false,
  ...overrides,
});

const status = (overrides: Partial<Agent> = {}, rescued = false, x: XConnection = connection()) =>
  agentStatus(agent(overrides), { rescued, connection: x });

describe('agentStatus', () => {
  it('says Stopped by AI Launchpad, with no toggle, once an admin stopped it', () => {
    expect(status({ stoppedAt: WHEN })).toMatchObject({
      state: 'stopped',
      label: 'Stopped by AI Launchpad',
      toggle: 'hidden',
    });
  });

  it('says Stopped over Paused when an admin stopped a Paused Agent', () => {
    expect(status({ stoppedAt: WHEN, pausedAt: WHEN })).toMatchObject({ state: 'stopped', toggle: 'hidden' });
  });

  it('says a Rescued token’s Agent will never post, with no toggle, though the backend reads it Locked', () => {
    expect(status({ graduatedAt: null }, true)).toMatchObject({
      state: 'rescued',
      label: 'This token was rescued, so its agent will never post',
      toggle: 'hidden',
    });
  });

  it('says Locked until the Pool opens, and still offers to Pause it, or Resume it when Paused', () => {
    expect(status({ graduatedAt: null })).toMatchObject({
      state: 'locked',
      label: 'Locked until the Pool opens',
      toggle: 'pause',
    });
    expect(status({ graduatedAt: null, pausedAt: WHEN })).toMatchObject({ state: 'locked', toggle: 'resume' });
    expect(status({ graduatedAt: null, name: null })).toMatchObject({ state: 'locked', toggle: 'pause' });
  });

  it('says Paused, with a Resume toggle, even when the Persona is unfinished', () => {
    expect(status({ pausedAt: WHEN })).toMatchObject({ state: 'paused', label: 'Paused', toggle: 'resume' });
    expect(status({ pausedAt: WHEN, lore: null })).toMatchObject({ state: 'paused' });
  });

  it('asks to finish the Persona when any of its four parts is missing', () => {
    for (const part of ['name', 'personality', 'lore', 'style'] as const) {
      expect(status({ [part]: null })).toMatchObject({
        state: 'unfinished',
        label: 'Finish the persona',
        toggle: 'pause',
      });
    }
  });

  it('says the X connection is being read until it arrives, rather than guessing', () => {
    expect(agentStatus(agent(), { rescued: false })).toMatchObject({
      state: 'reading-x',
      label: 'Checking the X connection…',
      toggle: 'pause',
    });
  });

  it('says the X connection could not be read when its read failed, rather than checking for good', () => {
    expect(agentStatus(agent(), { rescued: false, connectionUnreadable: true })).toMatchObject({
      state: 'x-unreadable',
      label: 'Couldn’t read the X connection',
      toggle: 'pause',
    });
  });

  it('names the one X step left, with a Pause toggle', () => {
    expect(status({}, false, connection({ outstandingGate: 'consent', xUsername: null }))).toMatchObject({
      state: 'needs-consent',
      label: 'Agree to the X terms',
      toggle: 'pause',
    });
    expect(status({}, false, connection({ outstandingGate: 'authorization', xUsername: null }))).toMatchObject({
      state: 'needs-authorization',
      label: 'Connect X',
      toggle: 'pause',
    });
    expect(status({}, false, connection({ outstandingGate: 'attestation', confirmedAt: null }))).toMatchObject({
      state: 'needs-attestation',
      label: 'Finish X setup',
      toggle: 'pause',
    });
  });

  it('asks to agree again when the terms changed on an Agent that was posting', () => {
    expect(status({}, false, connection({ outstandingGate: 'consent' }))).toMatchObject({
      state: 'needs-consent',
      label: 'Agree to the X terms',
    });
  });

  it('says Disconnected from X once the Creator took it off their X account', () => {
    expect(
      status({}, false, connection({ outstandingGate: 'authorization', xUsername: null, disconnected: true })),
    ).toMatchObject({ state: 'disconnected', label: 'Disconnected from X', toggle: 'pause' });
  });

  it('says Posting as the handle once every X step is done', () => {
    expect(status({}, false, connection())).toMatchObject({
      state: 'posting',
      label: 'Posting as @novaonchain',
      toggle: 'pause',
    });
  });

  it('puts Paused and an unfinished Persona before the X connection, as the backend does', () => {
    expect(status({ pausedAt: WHEN }, false, connection())).toMatchObject({ state: 'paused' });
    expect(status({ lore: null }, false, connection({ outstandingGate: 'consent' }))).toMatchObject({
      state: 'unfinished',
    });
  });
});

const blocked = (overrides: Partial<Agent> = {}, { rescued = false, unsavedEdits = false } = {}) =>
  agentStatus(agent(overrides), { rescued, unsavedEdits }).previewBlocked;

describe('agentStatus preview', () => {
  it('allows a Preview of a finished, Unlocked Agent, Paused or not', () => {
    expect(blocked()).toBeNull();
    expect(blocked({ pausedAt: WHEN })).toBeNull();
  });

  it('says why a Stopped, Rescued or Locked Agent writes no Preview, first reason first', () => {
    expect(blocked({ stoppedAt: WHEN, graduatedAt: null })).toBe('A stopped agent writes no previews');
    expect(blocked({ graduatedAt: null }, { rescued: true })).toBe('A rescued token’s agent writes no previews');
    expect(blocked({ graduatedAt: null, name: null })).toBe('Previews open once the Pool opens');
  });

  it('asks to finish the Persona, even on a Paused Agent', () => {
    expect(blocked({ style: null, pausedAt: WHEN })).toBe('Finish the persona to preview it');
  });

  it('asks to save first while the form has unsaved edits, since a Preview reads the saved Persona', () => {
    expect(blocked({}, { unsavedEdits: true })).toBe('Save to preview your changes');
    expect(blocked({ pausedAt: WHEN }, { unsavedEdits: true })).toBe('Save to preview your changes');
    expect(blocked({ lore: null }, { unsavedEdits: true })).toBe('Finish the persona to preview it');
  });
});
