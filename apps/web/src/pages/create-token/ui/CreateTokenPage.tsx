import { Link } from 'react-router';
import { routes } from '@/shared/config';
import { LaunchDraftProvider } from '../model/LaunchDraftProvider';
import { LaunchProvider } from '../model/LaunchProvider';
import { LaunchForm } from './LaunchForm';
import { TokenPreview } from './TokenPreview';
import './create-token.css';

export function CreateTokenPage() {
  return (
    <main className="bridge-main">
      <title>Launch a token · AI Launchpad</title>
      <div className="bridge-shell launchpad-create-page">
        <Link className="token-buy-back" to={routes.launchpad}>
          Back to explore
        </Link>
        <LaunchDraftProvider>
          <LaunchProvider>
            <div className="split-shell launchpad-create-shell">
              <LaunchForm />
              <TokenPreview />
            </div>
          </LaunchProvider>
        </LaunchDraftProvider>
      </div>
    </main>
  );
}
