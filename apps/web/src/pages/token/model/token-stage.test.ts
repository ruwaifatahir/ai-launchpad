import { describe, expect, it } from 'vitest';
import { GraduationPhase } from '@/entities/token';
import { tokenStage } from './token-stage';

describe('tokenStage', () => {
  it('is Not found when the factory has no launch record for the address', () => {
    expect(tokenStage({ exists: false, phase: GraduationPhase.NotGraduated }, false)).toEqual({ kind: 'not-found' });
  });

  it('is Bonding curve while the curve still has tokens to sell', () => {
    expect(tokenStage({ exists: true, phase: GraduationPhase.NotGraduated }, false)).toEqual({ kind: 'bonding-curve' });
  });

  it('is Graduation pending with graduate next when the curve sold out but was never swept', () => {
    expect(tokenStage({ exists: true, phase: GraduationPhase.NotGraduated }, true)).toEqual({
      kind: 'graduation-pending',
      nextStep: 'graduate',
    });
  });

  it('is Graduation pending with Pool creation next once the launch is swept', () => {
    expect(tokenStage({ exists: true, phase: GraduationPhase.Swept }, false)).toEqual({
      kind: 'graduation-pending',
      nextStep: 'create-pool',
    });
  });

  it('is Pool once the Pool is created', () => {
    expect(tokenStage({ exists: true, phase: GraduationPhase.PoolCreated }, false)).toEqual({ kind: 'pool' });
  });

  it('is Rescued once the swept funds were withdrawn', () => {
    expect(tokenStage({ exists: true, phase: GraduationPhase.Rescued }, false)).toEqual({ kind: 'rescued' });
  });

  it('ignores the curve once the launch has left the Bonding curve', () => {
    // A swept curve reports readyToGraduate false; the phase alone decides.
    expect(tokenStage({ exists: true, phase: GraduationPhase.PoolCreated }, true)).toEqual({ kind: 'pool' });
  });
});
