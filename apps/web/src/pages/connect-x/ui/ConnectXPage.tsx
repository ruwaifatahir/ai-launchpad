import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { readXReturn } from '@/entities/agent';
import { routes } from '@/shared/config';
import { toast } from '@/shared/ui/toast';
import { readLanding } from '../model/landing';
import './connect-x.css';

/**
 * `/connect/x`: where X's return lands. Says how it ended once, then goes back to the Agent, whose
 * X connection read shows the real state. Without a token it can only point the way back.
 */
export function ConnectXPage() {
  const [query] = useSearchParams();
  const [landing] = useState(() => readLanding(query, readXReturn()));
  const navigate = useNavigate();
  // Effects run twice in development; the message is shown once.
  const told = useRef(false);

  useEffect(() => {
    if (landing.token === null || told.current) return;
    told.current = true;
    const { tone, title, description } = landing.message;
    toast[tone]({ title, description });
    navigate(routes.agent(landing.token), { replace: true });
  }, [landing, navigate]);

  if (landing.token !== null) {
    return (
      <main className="bridge-main">
        <div className="bridge-shell terminal-shell connect-x-shell">
          <p className="connect-x-busy" role="status">
            Going back to your agent…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="bridge-main">
      <title>{`${landing.message.title} · AI Launchpad`}</title>
      <div className="bridge-shell terminal-shell connect-x-shell">
        <section className="connect-x-notice" aria-labelledby="connect-x-title">
          <h1 id="connect-x-title">{landing.message.title}</h1>
          <p>{landing.message.description} Your agent is one click from your profile.</p>
          <Link className="connect-x-link" to={routes.profile}>
            Go to your profile
          </Link>
        </section>
      </div>
    </main>
  );
}
