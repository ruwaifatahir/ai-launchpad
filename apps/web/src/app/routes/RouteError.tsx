import { Link, useRouteError } from 'react-router';
import { routes } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import './route-error.css';

/** A page chunk that no longer exists on the server, after a deploy: reloading fetches the new one. */
function isStaleChunk(error: unknown): boolean {
  return (
    error instanceof TypeError && /dynamically imported module|Importing a module script failed/.test(error.message)
  );
}

/**
 * Stands in for a page that threw while rendering or failed to load, inside the site header and
 * footer, so one broken page never blanks the whole app.
 */
export function RouteError() {
  const stale = isStaleChunk(useRouteError());
  const title = stale ? 'AI Launchpad was updated' : 'Something went wrong';

  return (
    <main className="bridge-main">
      <div className="bridge-shell route-error-shell">
        <section className="route-error" role="alert">
          <title>{`${title} · AI Launchpad`}</title>
          <h1>{title}</h1>
          <p>
            {stale
              ? 'Reload to get the latest version of this page.'
              : "This page hit an error it couldn't recover from. Reload to try again, or go back to Explore."}
          </p>
          <div className="route-error-actions">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Link to={routes.launchpad}>Back to explore</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
