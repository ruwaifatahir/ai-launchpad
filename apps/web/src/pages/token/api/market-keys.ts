import type { Address } from 'viem';

/** Query keys for the backend's market routes, so every market read can be refetched or invalidated together. */
export const marketKeys = {
  all: ['market'] as const,
  trades: (token: Address, page: number) => [...marketKeys.all, 'trades', token, page] as const,
  holders: (token: Address, page: number) => [...marketKeys.all, 'holders', token, page] as const,
  chart: (token: Address, range: string) => [...marketKeys.all, 'chart', token, range] as const,
};
