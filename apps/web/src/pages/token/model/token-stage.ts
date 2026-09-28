import { GraduationPhase } from '@/entities/token';

/**
 * Where a token is in its life, which decides what the Token page offers.
 * Graduation pending names the permissionless call that moves it on: the factory's
 * `graduate(token)` for a sold-out curve, or `createGraduatedPool(token)` once swept.
 */
export type TokenStage =
  | { kind: 'not-found' }
  | { kind: 'bonding-curve' }
  | { kind: 'graduation-pending'; nextStep: 'graduate' | 'create-pool' }
  | { kind: 'pool' }
  | { kind: 'rescued' };

/**
 * The stage of a launch, from the factory's launch record and whether its curve is sold out
 * (`readyToGraduate`). The curve only matters before the sweep: once swept it reports false.
 */
export function tokenStage(launch: { exists: boolean; phase: number }, curveSoldOut: boolean): TokenStage {
  if (!launch.exists) return { kind: 'not-found' };
  switch (launch.phase) {
    case GraduationPhase.NotGraduated:
      return curveSoldOut ? { kind: 'graduation-pending', nextStep: 'graduate' } : { kind: 'bonding-curve' };
    case GraduationPhase.Swept:
      return { kind: 'graduation-pending', nextStep: 'create-pool' };
    case GraduationPhase.PoolCreated:
      return { kind: 'pool' };
    case GraduationPhase.Rescued:
      return { kind: 'rescued' };
    default:
      throw new Error(`Unknown graduation phase ${launch.phase}`);
  }
}
