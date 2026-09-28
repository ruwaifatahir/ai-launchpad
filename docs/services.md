# Outside services

| Service | Needed for | Required |
| --- | --- | --- |
| RPC provider | Every app | Yes |
| UploadThing | Token logos | Yes |
| Reown (WalletConnect) | QR code and mobile wallets | No |
| Chainlink | USD prices | No |
| X developer app and OpenAI | The AI agent that posts to X | No |

## RPC provider

Use any provider that supports your chain, such as Alchemy, QuickNode or the chain's public RPC.

The indexer needs `eth_getLogs` over wide block ranges. Some free plans limit it to ten blocks, which is too small to catch up.

## UploadThing

Stores token logos.

1. Create an account at [uploadthing.com](https://uploadthing.com).
2. Create an app. Use one app per environment.
3. Open the app's API Keys page and copy the token.
4. Set `UPLOADTHING_TOKEN` in `apps/api/.env`.

The API refuses to start without a valid token.

## Reown (WalletConnect)

Lets people connect with a QR code or a mobile wallet. Without it, only browser wallets work.

1. Create a project at [dashboard.reown.com](https://dashboard.reown.com).
2. Add your frontend domains, and `localhost` for development, to the project's allowlist.
3. Set `VITE_WALLETCONNECT_PROJECT_ID` in the frontend.

## Chainlink USD prices

Shows USD values beside native amounts. Off by default. Without it, every USD field is empty.

1. Find the feed for your native token, for example ETH / USD, at [data.chain.link](https://data.chain.link).
2. In `apps/api/.env` set:

| Variable | Value |
| --- | --- |
| `DOLLAR_RATES` | `true` |
| `NATIVE_USD_FEED` | The feed's address |
| `QUOTE_ASSET_USD_FEEDS` | Optional. `0xToken:0xFeed` pairs for ERC20 quote assets, comma separated |
| `DOLLAR_RATE_RPC_URL`, `DOLLAR_RATE_CHAIN_ID` | Optional. Read the feeds from another chain, for example a testnet reading its mainnet's feeds |

## AI agent that posts to X

Each token creator can connect an X account, and an AI agent posts for the token. Off by default.

It needs an X developer app with paid API credits and an OpenAI API key.

### X developer app

1. Create a project and app at [developer.x.com](https://developer.x.com). Posting needs pay per use credits.
2. In the app's user authentication settings:

| Setting | Value |
| --- | --- |
| App permissions | Read and write |
| Type of app | Web App, Automated App or Bot |
| Callback URL | `https://api.example.com/api/v1/core/connections/callback` |
| Website URL | Your frontend URL |

3. Copy the OAuth 2.0 client ID and client secret.

The agent asks for the `tweet.read`, `tweet.write`, `users.read` and `offline.access` scopes.

### Settings

In `apps/api/.env`:

| Variable | Value |
| --- | --- |
| `AGENTS_ENABLED` | `true` |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | From the X app |
| `X_CALLBACK_URL` | Exactly the callback URL registered at X |
| `ENCRYPTION_KEY` | 32 random bytes in base64: `openssl rand -base64 32` |
| `OPENAI_API_KEY` | From [platform.openai.com](https://platform.openai.com) |
| `AI_MODEL` | Optional. Defaults to `openai/gpt-5.6-luna` |
| `X_DRY_RUN` | `true` runs everything except the final post. Use it to test. |

In the frontend, set `VITE_AGENTS_ENABLED=true`.

Follow X's [automation rules](https://help.x.com/en/rules-and-policies/x-automation). Each connected account must show X's [automated account label](https://help.x.com/en/using-x/automated-account-labels).

## Read only database user

The API only reads the indexer's database. In production, connect it as a read only user instead of `postgres`. `apps/api/sql/indexer-read-only-user.sql` creates one. Its header explains how to run it.
