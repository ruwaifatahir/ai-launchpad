import { WalletGate } from '@/features/connect-wallet';
import { Button } from '@/shared/ui/button';
import { useFinishGraduation, type GraduationStatus } from '../model/graduation';
import type { TokenIdentity } from '../model/token-identity';
import type { TokenStage } from '../model/token-stage';
import { TokenHeader } from './TokenHeader';

const buttonLabels: Record<GraduationStatus, string> = {
  idle: 'Finish graduation',
  signing: 'Confirm in your wallet',
  confirming: 'Finishing graduation…',
};

/**
 * Stands in for the trade card while Graduation is pending: trading is closed, and any Connected
 * wallet can send the step still needed to open the Pool.
 */
export function GraduationCard({
  identity,
  stage,
}: {
  identity: TokenIdentity;
  stage: Extract<TokenStage, { kind: 'graduation-pending' }>;
}) {
  const graduation = useFinishGraduation(identity, stage.nextStep);
  return (
    <article className="convert-card token-buy-card">
      <TokenHeader identity={identity} />
      <p className="token-trade-notice" role="note">
        {stage.nextStep === 'graduate'
          ? 'The Bonding curve sold out. Trading is closed until Graduation finishes and the Pool opens. Anyone can finish it.'
          : 'The Bonding curve is swept. Trading is closed until Graduation finishes and the Pool opens. Anyone can finish it.'}
      </p>
      <div className="token-graduation-action">
        <WalletGate>
          <Button busy={graduation.status !== 'idle'} onClick={() => void graduation.submit()}>
            {buttonLabels[graduation.status]}
          </Button>
        </WalletGate>
      </div>
    </article>
  );
}
