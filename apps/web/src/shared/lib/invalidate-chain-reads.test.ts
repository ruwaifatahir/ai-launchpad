import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateChainReads } from './invalidate-chain-reads';

describe('invalidateChainReads', () => {
  it('marks chain reads stale and leaves backend queries alone', async () => {
    const queryClient = new QueryClient();
    const keys = [['readContract', {}], ['readContracts', {}], ['balance', {}], ['simulateContract', {}], ['session']];
    for (const key of keys) queryClient.setQueryData(key, 1);

    await invalidateChainReads(queryClient);

    const stale = keys.map((key) => queryClient.getQueryState(key)?.isInvalidated);
    expect(stale).toEqual([true, true, true, true, false]);
  });
});
