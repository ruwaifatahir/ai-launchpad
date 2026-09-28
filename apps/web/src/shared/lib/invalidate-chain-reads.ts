import type { QueryClient } from '@tanstack/react-query';

/** The wagmi queries that read chain state, by the first entry of their query key. */
const CHAIN_READS = new Set(['readContract', 'readContracts', 'balance', 'simulateContract']);

/**
 * Re-reads what a mined transaction may have changed: every contract read, balance and simulation.
 * Queries to our backend, like the session, are left alone.
 */
export function invalidateChainReads(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ predicate: (query) => CHAIN_READS.has(String(query.queryKey[0])) });
}
