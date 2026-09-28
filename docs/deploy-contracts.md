# Deploy the contracts

Deploy the launchpad to any EVM chain that has Uniswap v4. It takes one command, and the output is ready to paste into each app's `.env`.

## What the chain needs

| Requirement | How to check |
| --- | --- |
| Uniswap v4 PoolManager, PositionManager and Permit2 | Listed on [Uniswap v4 deployments](https://developers.uniswap.org/docs/protocols/v4/deployments) |
| The CREATE2 deployer at `0x4e59b44847b379578588920cA78FbF26c0B4956C` | It has code on the chain's explorer. Most EVM chains have it. |

The deploy script checks both on chain before it sends any transaction.

## 1. Configure

```bash
cd packages/contracts
cp .env.example .env
```

Set these in `.env`:

| Variable | Value |
| --- | --- |
| `TARGET_RPC_URL` | RPC URL of the chain |
| `TARGET_CHAIN_ID` | Chain ID |
| `DEPLOYER_PRIVATE_KEY` | Key of a funded account. Never commit it. |
| `POOL_MANAGER` | Uniswap v4 PoolManager on this chain |
| `POSITION_MANAGER` | Uniswap v4 PositionManager on this chain |
| `PERMIT2` | Permit2, usually `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Optional:

| Variable | Default | Meaning |
| --- | --- | --- |
| `OWNER` | deployer | Final owner, for example a multisig |
| `PROTOCOL_FEE_RECIPIENT` | `OWNER` | Receives the protocol's fee share |
| `LAUNCH_FEE` | 0.0005 native | Fee per launch, in wei |
| `LAUNCH_PHANTOM_QUOTE` | 1.68 native | Curve's virtual starting reserve, in wei |
| `LAUNCH_GRADUATION_THRESHOLD` | 4.2 native | Native raised before a token moves to Uniswap, in wei |

The two curve defaults are sized for ETH. Change them if the native token is worth much more or less than ETH.

## 2. Deploy

```bash
pnpm build
pnpm deploy:target
```

The script:

1. Checks the chain ID, the CREATE2 deployer and the Uniswap contracts.
2. Deploys the seven launchpad contracts and the launch and buy helper.
3. Wires them together and enables launches.
4. Starts a two step ownership transfer when `OWNER` differs from the deployer.
5. Writes `deployments/target-<chainId>-<timestamp>.json`.

If you set `OWNER`, that account must call `acceptOwnership()` on each address the script prints. Until then the deployer still owns them.

## 3. Get the app settings

```bash
pnpm print-env
```

This prints env blocks for `apps/api`, `apps/indexer` and `apps/web`. Paste each into that app's `.env`. Fill the three frontend Uniswap addresses it leaves empty (Quoter, StateView, Universal Router) from the Uniswap deployments page.

## Optional: add an ERC20 quote asset

Tokens launch against the native token by default. To let them launch against an ERC20 too, the owner runs:

```bash
QUOTE_TOKEN=0x... QUOTE_PER_NATIVE=2500 pnpm quote:add
```

`QUOTE_PER_NATIVE` is how many whole tokens one native token is worth. The script sizes the curve from it. Set `QUOTE_APPROVED=false` to stop new launches against a token.

Then add the token to `VITE_QUOTE_ASSETS` in `apps/web/.env`.

## Optional: verify on an explorer

Set `ETHERSCAN_API_KEY`. For a chain Etherscan does not list, also set `TARGET_EXPLORER`, `TARGET_EXPLORER_URL` and `TARGET_EXPLORER_API_URL`. Then:

```bash
pnpm hardhat verify --network target <address> <constructor args>
```

## Check the contracts match Pons

```bash
pnpm parity
```

This compares the compiled contracts with Pons' live deployment on Robinhood Chain mainnet. It needs no keys.
