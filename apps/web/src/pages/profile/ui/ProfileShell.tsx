import type { ReactNode } from 'react';
import './profile.css';

/** The page frame every Profile state draws inside. */
export function ProfileShell({ children }: { children: ReactNode }) {
  return (
    <main className="bridge-main">
      <div className="bridge-shell terminal-shell profile-shell">{children}</div>
    </main>
  );
}

/** One quiet panel in place of the Profile: a bad address, or no wallet to show. */
export function ProfileStatus({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="profile-status launch-explore float">
      <title>{`${title} · AI Launchpad`}</title>
      <h1>{title}</h1>
      {children}
    </section>
  );
}
