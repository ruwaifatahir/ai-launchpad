# syntax=docker/dockerfile:1
# Built from the repository root, which holds the lockfile:
#   docker build -f apps/api/Dockerfile -t ai-launchpad-api .

# ---------- Build ----------
FROM node:22 AS builder

# The same pnpm as the root package.json's packageManager field.
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api apps/api

# The API's dependencies only, dev ones included, pinned by the root lockfile. The pnpm
# store is a build cache, never an image layer.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --filter @ai-launchpad/api

WORKDIR /repo/apps/api

RUN pnpm db:generate

# swagger-jsdoc reads the route comments out of src/, which the runtime stage does not
# carry. Freeze the spec to a file here, while the sources are still present.
RUN pnpm openapi:generate

RUN pnpm build

# pnpm deploy copies the production dependencies alone into /out, none of the other
# workspace packages. pnpm 10 and later deploy only with injected workspace packages;
# the API depends on none, so turning it on here changes nothing it installs.
WORKDIR /repo
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm --filter @ai-launchpad/api --config.inject-workspace-packages=true \
  deploy --prod --frozen-lockfile /out

# The generated Prisma client belongs beside the @prisma/client that /out resolves, so
# it is generated again there, with the CLI from the build. The config file is dropped
# first: it only points the CLI at prisma/, which --schema does here, and it imports a
# package the production install does not hoist.
WORKDIR /out
RUN rm prisma.config.ts && /repo/apps/api/node_modules/.bin/prisma generate --schema prisma

# ---------- Runtime ----------
FROM node:22-slim

# Prisma generates a query engine built against openssl 3, and node:22-slim
# carries no openssl at all. Without this, Prisma cannot detect a version,
# falls back to openssl 1.1.x, and looks for an engine that was never built,
# so every query fails at runtime while the process itself starts cleanly.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /out/package.json ./package.json
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /repo/apps/api/dist ./dist

# The frozen OpenAPI spec. Without it the app refuses to boot, rather than serving
# /api-docs with its tags present and every route missing.
COPY --from=builder /repo/apps/api/openapi.json ./openapi.json

EXPOSE 3000

# The node image ships an unprivileged node user. Nothing here writes to disk at
# runtime, so the process never needs root, and a compromise of it is not one.
USER node

# The image carries its own probe because it carries neither curl nor wget. An
# orchestrator that generates a curl health check against this image marks every
# container unhealthy no matter how well the app is running. Node is already here.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/core/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
