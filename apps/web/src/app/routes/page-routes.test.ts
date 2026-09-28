import { describe, expect, it } from 'vitest';
import { routes } from '@/shared/config';
import { pageRoutes } from './page-routes';

const paths = (agents: boolean) => pageRoutes({ agents }).map((route) => route.path);
const AGENT_PATHS = [routes.agent(':address'), routes.connectX];

describe('pageRoutes', () => {
  it('has no Agent or X connection page without Agents', () => {
    for (const path of AGENT_PATHS) expect(paths(false)).not.toContain(path);
  });

  it('adds the Agent and X connection pages with Agents, before the catch-all', () => {
    const withAgents = paths(true);
    expect(withAgents).toEqual(expect.arrayContaining(AGENT_PATHS));
    expect(withAgents.at(-1)).toBe('*');
  });

  it('keeps every other page either way', () => {
    const without = paths(false);
    expect(paths(true).filter((path) => !AGENT_PATHS.includes(path as string))).toEqual(without);
    expect(without).toEqual(expect.arrayContaining([routes.launchpad, routes.createToken, routes.token(':address')]));
  });
});
