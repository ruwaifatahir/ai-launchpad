<div align="center">

# AI Launchpad

An open source token launchpad for any EVM chain with Uniswap v4.

[![CI](https://github.com/ruwaifatahir/ai-launchpad/actions/workflows/ci.yml/badge.svg)](https://github.com/ruwaifatahir/ai-launchpad/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

## What it does

- Anyone launches a token in one transaction, with an optional first buy.
- Each token trades on a bonding curve until it raises its target.
- Then it moves to a Uniswap v4 pool, and the liquidity is locked for good.
- Creators earn a share of trading fees.
- An optional AI agent posts to X for each token.

## What's inside

| Path | What | Built with |
| --- | --- | --- |
| [`apps/web`](apps/web) | Frontend | React, Vite, wagmi, RainbowKit |
| [`apps/api`](apps/api) | API | Express, Prisma, Postgres, Redis |
| [`apps/indexer`](apps/indexer) | Chain indexer | Ponder, Postgres |
| [`packages/contracts`](packages/contracts) | Smart contracts and deploy scripts | Solidity, Hardhat |

## Run it locally

You need Node 22, pnpm 11 and Docker. The example settings point at a public deployment on Robinhood Chain testnet, so nothing needs deploying first.

```bash
pnpm install
```

Indexer:

```bash
cd apps/indexer
cp .env.example .env.local
docker compose up -d
pnpm dev
```

API, in a second terminal. Set `UPLOADTHING_TOKEN` in `.env` first ([how](docs/services.md#uploadthing)).

```bash
cd apps/api
cp .env.example .env
docker compose up -d
pnpm db:push
pnpm dev
```

Frontend, in a third terminal:

```bash
cd apps/web
cp .env.example .env.local
pnpm dev
```

Open http://localhost:5173.

## Launch your own

1. [Deploy the contracts](docs/deploy-contracts.md) to your chain.
2. [Put the backend and frontend live](docs/self-hosting.md).
3. [Set up the outside services](docs/services.md) you want.

## Security

The contracts are the official [Pons](https://ponsfamily.com) V2 contracts, copied unchanged from the verified source on Robinhood Chain mainnet, where they run live. They have not been independently audited. Use them at your own risk.

Report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Credits

The contracts and the frontend's design come from [Pons](https://ponsfamily.com). See [NOTICE.md](NOTICE.md) for every third party component and its license.

## Support the project

If this saves you time, you can send a tip on any EVM chain:

```
0x8b648Cd963124D912E7c4Eb35E60730aDDe10503
```

## License

[MIT](LICENSE). Third party parts keep their own licenses, listed in [NOTICE.md](NOTICE.md).
