import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import request from "supertest";

import app from "@/app";
import { env } from "@/config/env";
import prisma from "@/config/database";
import { endIndexer } from "@/lib/indexer/client";
import { cacheRedis, redis } from "@/lib/redis/client";
import {
  ALICE,
  BOB,
  BURN,
  CAROL,
  CURVE,
  DAVE,
  GRADUATED,
  OTHER,
  SMALL,
  UNKNOWN,
  UNTRADED,
  adminPool,
  deployIndexer,
  dropIndexer,
  ensureDatabase,
} from "@test/e2e/_helpers/indexer";

// Every query the holders route makes runs here against Postgres, over the views a
// Ponder deploy leaves in the indexer schema. The zero balance filter, the order, the
// paging and both counts are SQL, so this suite is where they are proved.
//
// The graduated token has a billion tokens. Its holders, largest first: the
// PoolManager 500M, ALICE the creator 200M, the locker 100M, the buyback vault 50M,
// BOB and CAROL 40M each, the burn address 30M, the hook 20M, and three small holders
// at 1M. DAVE and the curve sit at zero.

const KEY_PATTERNS = ["rl:*", "market:*"];

const clearKeys = async () => {
  for (const pattern of KEY_PATTERNS) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
};

let db: pg.Pool;

const holders = (address: string, query = "") =>
  request(app).get(`/api/v1/market/tokens/${address}/holders${query}`);

type Holder = { wallet: string; balance: string; share: number; label: string | null };

const listed = async (address: string) => {
  const first = (await holders(address)).body.data.holders as Holder[];
  const second = (await holders(address, "?page=2")).body.data.holders as Holder[];
  return [...first, ...second];
};

beforeAll(async () => {
  await ensureDatabase();
  db = adminPool();
  await dropIndexer(db);
  await deployIndexer(db, "e2e0401");
});

beforeEach(async () => {
  await clearKeys();
});

afterAll(async () => {
  await dropIndexer(db);
  await db.end();
  await endIndexer();
  await clearKeys();
  await redis.quit();
  await cacheRedis.quit();
  await prisma.$disconnect();
});

describe("a visitor reads a graduated token's holders", () => {
  it("lists ten a page, largest balance first, breaking an equal balance by wallet", async () => {
    const first = (await holders(GRADUATED)).body.data.holders as Holder[];
    const all = await listed(GRADUATED);

    expect(first).toHaveLength(10);
    expect(all.map((holder) => holder.wallet)).toEqual([
      env.POOL_MANAGER_ADDRESS,
      ALICE,
      env.LOCKER_ADDRESS,
      env.BUYBACK_VAULT_ADDRESS,
      BOB,
      CAROL,
      BURN,
      env.HOOK_ADDRESS,
      ...SMALL,
    ]);
  });

  it("leaves out a wallet that sold out and a curve that closed, whose balances are zero", async () => {
    const wallets = (await listed(GRADUATED)).map((holder) => holder.wallet);

    expect(wallets).not.toContain(DAVE);
    expect(wallets).not.toContain(CURVE);
  });

  it("counts every listed holder for paging, and only real holders in the holder count", async () => {
    const res = await holders(GRADUATED);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 11, holderCount: 6 });
  });

  it("labels each protocol holder and the creator, and no one else", async () => {
    const labels = Object.fromEntries(
      (await listed(GRADUATED)).map((holder) => [holder.wallet, holder.label]),
    );

    expect(labels).toEqual({
      [env.POOL_MANAGER_ADDRESS]: "uniswap_pool",
      [ALICE]: "creator",
      [env.LOCKER_ADDRESS]: "locker",
      [env.BUYBACK_VAULT_ADDRESS]: "buyback_vault",
      [BOB]: null,
      [CAROL]: null,
      [BURN]: "burn_address",
      [env.HOOK_ADDRESS]: "hook",
      [SMALL[0]]: null,
      [SMALL[1]]: null,
      [SMALL[2]]: null,
    });
  });

  it("reads each balance exact and its share of the current supply", async () => {
    const [largest] = (await holders(GRADUATED)).body.data.holders as Holder[];

    expect(largest).toEqual({
      wallet: env.POOL_MANAGER_ADDRESS,
      balance: (500n * 10n ** 24n).toString(),
      share: 50,
      label: "uniswap_pool",
    });
  });

  it("answers a page past the end with no holders and the counts", async () => {
    const res = await holders(GRADUATED, "?page=3");

    expect(res.body.data).toMatchObject({ holders: [], total: 11, holderCount: 6 });
  });
});

describe("a visitor reads other tokens", () => {
  it("lists only the token's own holders, labelling its own curve", async () => {
    const { data } = (await holders(OTHER)).body;

    expect(data).toMatchObject({ total: 2, holderCount: 1 });
    expect(data.holders).toEqual([
      {
        wallet: ALICE,
        balance: (900n * 10n ** 24n).toString(),
        share: 90,
        label: "creator",
      },
      {
        wallet: CURVE,
        balance: (100n * 10n ** 24n).toString(),
        share: 10,
        label: "bonding_curve",
      },
    ]);
  });

  it("answers 200 with no holders for a launched token nobody holds", async () => {
    const res = await holders(UNTRADED);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ holders: [], total: 0, holderCount: 0 });
  });

  it("answers 404 for a token the indexer holds no launch for", async () => {
    const res = await holders(UNKNOWN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TOKEN_NOT_FOUND");
  });
});

describe("the five second cache", () => {
  it("holds a served page in Redis for five seconds, under the lowercased token", async () => {
    await holders("0x00000000000000000000000000000000000000A1", "?page=2");

    const key = `market:v2:holders:${GRADUATED}:2`;
    const ttl = await redis.ttl(key);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5);
    expect(JSON.parse((await redis.get(key)) as string).holderCount).toBe(6);
  });
});
