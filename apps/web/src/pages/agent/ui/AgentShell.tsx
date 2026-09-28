import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { routes } from '@/shared/config';
import './agent.css';

/** The page frame every Agent page state draws inside, with the way back to the token. */
export function AgentShell({ token, children }: { token: string | undefined; children: ReactNode }) {
  return (
    <main className="bridge-main">
      <div className="bridge-shell terminal-shell agent-shell">
        <Link className="agent-back" to={token ? routes.token(token) : routes.launchpad}>
          {token ? 'Back to token' : 'Back to explore'}
        </Link>
        {children}
      </div>
    </main>
  );
}

/** One quiet panel in place of the page: loading, a failure, or a wallet that cannot manage this Agent. */
export function AgentNotice({
  title,
  busy = false,
  children,
}: {
  title: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="agent-panel agent-notice" aria-busy={busy || undefined}>
      <title>{`${title.replace(/…$/, '')} · AI Launchpad`}</title>
      <h1>{title}</h1>
      {children}
    </section>
  );
}
