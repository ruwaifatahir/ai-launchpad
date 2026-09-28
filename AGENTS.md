# Working in this repository

A pnpm and Turborepo monorepo. Node 22, pnpm 11.

| Path | What it is |
| --- | --- |
| `apps/web` | Vite, React, wagmi and RainbowKit frontend. Feature Sliced Design. |
| `apps/api` | Express 5, Prisma, BullMQ and Redis backend. |
| `apps/indexer` | Ponder indexer for the launchpad contracts. Its own Postgres. |
| `packages/contracts` | Hardhat 3. The Pons V2 contracts and their deploy scripts. |

## Commands

```bash
pnpm install
pnpm check                              # typecheck, lint, format check, test, build everywhere
pnpm --filter @ai-launchpad/api test    # one package
```

Run `pnpm check` before every push. CI runs the same.

## Rules

- Never edit `packages/contracts/contracts/`. It matches the verified Pons source byte for byte.
- Every chain setting comes from env. Never hard code a chain ID, RPC URL or address.
- Each app validates its env at startup. A new variable goes in that app's `.env.example` with a one line comment.
- Write tests in the mirrored path under each app's `test/` folder, or beside the file in `apps/web`.
- The API uses `pnpm db:push`, not migrations.

## Skills

`npx skills install` restores the agent skills listed in `skills-lock.json`.
