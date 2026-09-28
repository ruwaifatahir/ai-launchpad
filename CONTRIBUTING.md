# Contributing

Thanks for helping. Keep changes small and focused.

## Setup

```bash
corepack enable
pnpm install
```

## Before opening a pull request

```bash
pnpm check
```

This runs typecheck, lint, format check, tests and build in every package. CI runs the same.

## Rules

- One change per pull request. Explain why in the description.
- Add or update tests with the change.
- Do not edit anything under `packages/contracts/contracts/`. Those files match the verified Pons source byte for byte.
- Never commit secrets. Use `.env` files, which git ignores.
