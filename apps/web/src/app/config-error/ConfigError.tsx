import '../routes/route-error.css';
import './config-error.css';

/**
 * Stands in for the whole app when the `VITE_*` variables are missing or malformed, so a deploy
 * with a broken configuration says what to fix instead of failing somewhere deep in a page.
 */
export function ConfigError({ errors }: { errors: readonly string[] }) {
  return (
    <div className="theme-ready">
      <div className="bridge-page">
        <main className="bridge-main">
          <div className="bridge-shell route-error-shell">
            <section className="route-error" role="alert">
              <title>Configuration error · AI Launchpad</title>
              <h1>AI Launchpad is not configured</h1>
              <p>
                Fix these environment variables, then rebuild or restart the dev server. Every variable is described in
                <code> .env.example</code>.
              </p>
              <ul className="config-error-list">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
