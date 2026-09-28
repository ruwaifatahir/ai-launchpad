# syntax=docker/dockerfile:1
# Built from the repository root, which holds the lockfile:
#   docker build -f apps/indexer/Dockerfile -t ai-launchpad-indexer .

# pnpm deploy copies the indexer and its production dependencies, pinned by the root
# lockfile, into /out, and none of the other workspace packages. pnpm 10 and later deploy
# only with injected workspace packages; the indexer depends on none, so turning it on
# here changes nothing it installs.
FROM node:22-slim AS build

# The same pnpm as the root package.json's packageManager field.
RUN npm install --global pnpm@11.6.0

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/indexer apps/indexer

# The pnpm store is a build cache, never an image layer.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm --filter @ai-launchpad/indexer --config.inject-workspace-packages=true \
  deploy --prod --frozen-lockfile /out \
  && mv /out/node_modules /deps

FROM node:22-slim

ENV NODE_ENV=production

WORKDIR /app

# The dependencies stay owned by root, so the app cannot rewrite them. Ponder writes its
# build cache under .ponder/ and its generated files at runtime, so the app user owns
# /app and the sources.
COPY --from=build /deps ./node_modules
COPY --from=build --chown=node:node /out ./
RUN chown node:node /app

# Ponder never reuses a schema another deploy has written, so each build gets its own.
# A restart of the same image resumes in the same schema. --views-schema then points
# the fixed name "indexer" at this deploy's tables once it has caught up, and that name
# is what readers query.
ARG GIT_SHA=local
ENV DATABASE_SCHEMA=indexer_${GIT_SHA}

EXPOSE 42069

USER node

# /health answers as soon as the process is up. /ready waits for the backfill, which
# can outlast any start period, so it is watched separately and never gates a deploy.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:42069/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Ponder is run directly: the image has no pnpm.
CMD ["node_modules/.bin/ponder", "start", "--views-schema", "indexer"]
