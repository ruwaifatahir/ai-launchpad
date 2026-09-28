import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { pairedAssets } from '@/shared/config';
import { LaunchDraftContext, type LaunchDraftActions } from './launch-draft';
import type { LaunchDraft } from './launch-plan';

const EMPTY_DRAFT: LaunchDraft = {
  name: '',
  ticker: '',
  description: '',
  logo: '',
  xHandle: '',
  telegram: '',
  pairedAsset: pairedAssets[0],
  developerBuy: '',
  buyback: true,
  creatorWallet: '',
  creatorTax: '',
  snipeExemptions: [],
};

export function LaunchDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const set = useCallback<LaunchDraftActions['set']>(
    (field, value) => setDraft((current) => ({ ...current, [field]: value })),
    [],
  );

  const value = useMemo(() => ({ state: draft, actions: { set } }), [draft, set]);

  return <LaunchDraftContext value={value}>{children}</LaunchDraftContext>;
}
