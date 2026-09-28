import type { LaunchToken } from './launch-token';

/** What a grid of token cards shows. */
export type TokenGridView =
  | { status: 'loading' }
  /** The backend or the indexer did not answer. Only the grid says so; the rest of the page works on. */
  | { status: 'unavailable' }
  | { status: 'empty'; message: string }
  | { status: 'ready'; tokens: LaunchToken[] };
