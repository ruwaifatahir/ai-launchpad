# Put it live

The backend runs on one server with Docker Compose. The frontend is a static site on any static host.

| Part | Where it runs |
| --- | --- |
| API, indexer, two Postgres databases, Redis | One Linux server, from `deploy/compose.yml` |
| HTTPS for the API | Caddy, in the same compose file. It gets the certificate itself. |
| Frontend | Vercel, Netlify, Cloudflare Pages or any static host |

Deploy the contracts first ([deploy-contracts.md](deploy-contracts.md)) and keep the output of `pnpm print-env`.

## 1. Server

Any Linux server with 2 CPUs, 4 GB RAM and Docker installed. Open ports 80 and 443.

Point a DNS A record, for example `api.example.com`, at the server.

```bash
git clone https://github.com/ruwaifatahir/ai-launchpad.git
cd ai-launchpad
```

## 2. Settings

```bash
cp deploy/.env.example deploy/.env
cp apps/api/.env.example apps/api/.env
cp apps/indexer/.env.example apps/indexer/.env.local
```

| File | Set |
| --- | --- |
| `deploy/.env` | `API_DOMAIN`, and two database passwords from `openssl rand -hex 24` |
| `apps/indexer/.env.local` | The indexer block from `pnpm print-env`, and an RPC that serves `eth_getLogs` over wide block ranges |
| `apps/api/.env` | The API block from `pnpm print-env`, `PANEL_ORIGINS` (your frontend URL), `JWT_SECRET`, `ADMIN_API_KEY`, `UPLOADTHING_TOKEN` |

Leave the database and Redis URLs as they are. The compose file sets the right ones.

Generate each secret with `openssl rand -hex 32`. See [services.md](services.md) for UploadThing and the optional services.

## 3. Start

```bash
docker compose -f deploy/compose.yml run --rm api-schema
GIT_SHA=$(git rev-parse --short HEAD) docker compose -f deploy/compose.yml up -d --build
```

The first line creates the API's tables. The second builds and starts everything.

Check it:

```bash
curl https://api.example.com/api/v1/core/health
```

It returns `"database":"up","redis":"up"` once the API is ready. The indexer reads the chain from `START_BLOCK` first, so tokens appear after that catches up.

## 4. Frontend

Create a site on your static host from this repository:

| Setting | Value |
| --- | --- |
| Root directory | `apps/web` |
| Install command | `pnpm install` |
| Build command | `pnpm build` |
| Output directory | `dist` |

Add every variable from `apps/web/.env.example` in the host's settings. Use the web block from `pnpm print-env`, and set `VITE_API_URL` to `https://api.example.com`.

Vite writes these values into the build. Change one and you must rebuild.

The site needs every path to serve `index.html`. `apps/web/vercel.json` does this on Vercel. On other hosts, add the host's single page app rewrite.

## Update

```bash
git pull
docker compose -f deploy/compose.yml run --rm --build api-schema
GIT_SHA=$(git rev-parse --short HEAD) docker compose -f deploy/compose.yml up -d --build
```

Each new version of the indexer writes to a new schema and reads the chain again from `START_BLOCK`. The API keeps reading the previous data until the new schema catches up.

## Logs

```bash
docker compose -f deploy/compose.yml logs -f api
docker compose -f deploy/compose.yml logs -f indexer
```

## Other platforms

Each app has its own Dockerfile, built from the repository root:

```bash
docker build -f apps/api/Dockerfile .
docker build -f apps/indexer/Dockerfile .
```

Any platform that runs containers works, such as Coolify, Railway or Render. Give each app its own Postgres, give the API a Redis, and set the same variables.
