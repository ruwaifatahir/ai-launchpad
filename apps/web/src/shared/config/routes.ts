/** In-app route paths. Build links from here instead of hard-coding strings. */
export const routes = {
  home: '/',
  launchpad: '/launchpad',
  createToken: '/launchpad/create',
  token: (address: string) => `/launchpad/${address}`,
  /** Where a token's Creator manages its Agent. */
  agent: (address: string) => `/launchpad/${address}/agent`,
  /** Where X sends a Creator back after Authorization. Registered with the backend: keep it exact. */
  connectX: '/connect/x',
  analytics: '/analytics',
  /** The Connected wallet's own Profile, reached through a redirect to its address. */
  profile: '/profile',
  profileOf: (address: string) => `/profile/${address}`,
} as const;
