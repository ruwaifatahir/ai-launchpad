import { env } from './env';

/** Optional parts of the app, switched on per deployment. */
export const features = {
  /**
   * AI Agents that post to X for a token, and the X connection behind them. Off unless
   * `VITE_AGENTS_ENABLED=true`, because the API serves those routes only when it has them turned on.
   */
  agents: env.agentsEnabled,
} as const;
