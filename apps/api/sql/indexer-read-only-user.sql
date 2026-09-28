-- The read only user the API reads the indexer as. The indexer is the only writer of
-- chain data, so the API connects as a user that can do nothing but read it. One per
-- environment, run once as a superuser on the indexer's database, with psql:
--
--   psql -v role=launchpad_reader -v password=... -v owner=postgres -d indexer -f indexer-read-only-user.sql
--
-- role      the user to create
-- password  its password, which goes into the API's INDEXER_DATABASE_URL
-- owner     the role the indexer connects as, which owns every view it creates
--
-- Ponder drops and recreates every view in the indexer schema on each deploy, and a
-- dropped view takes its grants with it. The default privileges below are what grant
-- SELECT on each new view as the owner creates it, so the user keeps reading after a
-- redeploy. Only the views are readable: the indexer_<sha> schemas behind them grant
-- this user nothing, and a view reads its tables with its owner's rights.
--
-- pnpm test:e2e runs this file against a local Postgres, redeploys the views, and
-- reads again.

CREATE ROLE :"role" LOGIN PASSWORD :'password';

-- The grants below are the guard. This is a second line only: a client could turn it
-- off for its own session, but it stops a stray write from a connection that forgot.
-- On Postgres 15 and later, PUBLIC cannot create in public.
ALTER ROLE :"role" SET default_transaction_read_only = on;

GRANT USAGE ON SCHEMA indexer TO :"role";
GRANT SELECT ON ALL TABLES IN SCHEMA indexer TO :"role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA indexer GRANT SELECT ON TABLES TO :"role";
