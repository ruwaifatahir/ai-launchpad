import type { ReactNode } from 'react';
import { LaunchContext, useLaunchController } from './launch';

/** Runs the launch for everything under it; sits inside LaunchDraftProvider, which it launches. */
export function LaunchProvider({ children }: { children: ReactNode }) {
  return <LaunchContext value={useLaunchController()}>{children}</LaunchContext>;
}
