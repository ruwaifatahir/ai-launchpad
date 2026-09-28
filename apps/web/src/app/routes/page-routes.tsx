import { Navigate, type RouteObject } from 'react-router';
import { routes } from '@/shared/config';

// Each page is code-split: its chunk downloads only when the route is first visited.
const PAGES: RouteObject[] = [
  { index: true, element: <Navigate to={routes.launchpad} replace /> },
  {
    path: routes.launchpad,
    lazy: async () => ({ Component: (await import('@/pages/launchpad')).LaunchpadPage }),
  },
  {
    path: routes.createToken,
    lazy: async () => ({ Component: (await import('@/pages/create-token')).CreateTokenPage }),
  },
  {
    path: routes.token(':address'),
    lazy: async () => ({ Component: (await import('@/pages/token')).TokenPage }),
  },
  {
    path: routes.analytics,
    lazy: async () => ({ Component: (await import('@/pages/analytics')).AnalyticsPage }),
  },
  {
    path: routes.profile,
    lazy: async () => ({ Component: (await import('@/pages/profile')).ProfileRedirectPage }),
  },
  {
    path: routes.profileOf(':address'),
    lazy: async () => ({ Component: (await import('@/pages/profile')).ProfilePage }),
  },
];

/** A token's Agent, and the page X returns a Creator to after Authorization. */
const AGENT_PAGES: RouteObject[] = [
  {
    path: routes.agent(':address'),
    lazy: async () => ({ Component: (await import('@/pages/agent')).AgentPage }),
  },
  {
    path: routes.connectX,
    lazy: async () => ({ Component: (await import('@/pages/connect-x')).ConnectXPage }),
  },
];

/**
 * The app's pages. Without Agents their routes do not exist, so an old link to one falls through
 * to Explore like any unknown path.
 */
export function pageRoutes({ agents }: { agents: boolean }): RouteObject[] {
  return [...PAGES, ...(agents ? AGENT_PAGES : []), { path: '*', element: <Navigate to={routes.launchpad} replace /> }];
}
