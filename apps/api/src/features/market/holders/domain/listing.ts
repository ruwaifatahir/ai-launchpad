import { env } from "@/config/env";
import { cachedMarketRead } from "@/features/market/cache";
import type { LaunchRow } from "@/features/market/launches/launches.repo";
import { requireLaunch } from "@/features/market/launches/lookup";
import { TOKEN_DECIMALS, percentOf } from "@/features/market/pricing";
import { PAGE_SIZE, pageWindow } from "@/features/market/request";
import type { HoldersRequest } from "@/features/market/holders/domain/schema";
import {
  countHoldersByToken,
  findHoldersByToken,
} from "@/features/market/holders/holders.repo";

// Where wallets send tokens they want out of circulation. The token's own burn() sends
// to the zero address instead, which the indexer never lists as a holder.
const BURN_ADDRESS = "0x000000000000000000000000000000000000dead";

export const HOLDER_LABELS = [
  "bonding_curve",
  "uniswap_pool",
  "locker",
  "buyback_vault",
  "hook",
  "burn_address",
  "creator",
] as const;

export type HolderLabel = (typeof HOLDER_LABELS)[number];

// What each labelled wallet is. A later entry wins, so a creator who is somehow also
// a protocol holder reads as the contract. Every address is lowercase: the
// config lowercases its own and the indexer writes its own that way.
const labelsFor = (launch: LaunchRow) =>
  new Map<string, HolderLabel>([
    [launch.creator, "creator"],
    [BURN_ADDRESS, "burn_address"],
    [env.HOOK_ADDRESS, "hook"],
    [env.BUYBACK_VAULT_ADDRESS, "buyback_vault"],
    [env.LOCKER_ADDRESS, "locker"],
    [env.POOL_MANAGER_ADDRESS, "uniswap_pool"],
    [launch.curve, "bonding_curve"],
  ]);

const readHolders = async ({
  params,
  query,
}: Pick<HoldersRequest, "params" | "query">) => {
  const launch = await requireLaunch(params.token);

  const [counts, rows] = await Promise.all([
    countHoldersByToken(params.token),
    findHoldersByToken(params.token, pageWindow(query.page)),
  ]);

  const labels = labelsFor(launch);

  return {
    tokenDecimals: TOKEN_DECIMALS,
    supply: launch.supply,
    page: query.page,
    pageSize: PAGE_SIZE,
    total: counts.total,
    holderCount: counts.holderCount,
    holders: rows.map((holder) => ({
      wallet: holder.wallet,
      balance: holder.balance,
      // A percent of the current supply. Null only for a supply of zero, which a
      // token with a holder cannot have.
      share: percentOf(holder.balance, launch.supply),
      label: labels.get(holder.wallet) ?? null,
    })),
  };
};

export const listHolders = (request: Pick<HoldersRequest, "params" | "query">) =>
  cachedMarketRead("holders", request.params.token, request.query.page, () =>
    readHolders(request),
  );
