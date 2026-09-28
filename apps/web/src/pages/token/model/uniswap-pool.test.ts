import { zeroAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { contracts, pairedAssets, type PairedAsset } from '@/shared/config';
import { poolId, poolKey } from './uniswap-pool';

// `.env.test` pairs launches with ETH and one ERC-20, NVDA, a mintable test token.
const [, nvda] = pairedAssets as readonly [PairedAsset, PairedAsset];

/** TMEME, NVDA-paired and graduated on our testnet, from its launch record. */
const TMEME = '0xA92d2c66716C216A7a7a4fFa0b953167A2bf4cbB';
const tmemeLaunch = { token: TMEME, pairToken: nvda.address, poolFee: 0, tickSpacing: 200 } as const;

describe('poolKey', () => {
  it('always makes ETH currency0, since it is address(0)', () => {
    expect(poolKey({ ...tmemeLaunch, pairToken: zeroAddress })).toEqual({
      currency0: zeroAddress,
      currency1: TMEME,
      fee: 0,
      tickSpacing: 200,
      hooks: contracts.memeHook,
    });
  });

  it('puts an ERC-20 Paired asset first when its address is lower than the token', () => {
    // NVDA 0x0aE6… sorts before TMEME 0xA92d….
    expect(poolKey(tmemeLaunch)).toMatchObject({ currency0: nvda.address, currency1: TMEME });
  });

  it('puts the token first when its address is lower than the Paired asset', () => {
    const token = '0x0000000000000000000000000000000000000abc';
    expect(poolKey({ ...tmemeLaunch, token })).toMatchObject({ currency0: token, currency1: nvda.address });
  });

  it('compares addresses by value, not by their checksum casing', () => {
    // 0xa9… lowercase would sort after 0x0A… uppercase as text; as numbers it still comes second.
    expect(poolKey({ ...tmemeLaunch, token: TMEME.toLowerCase() as `0x${string}` }).currency0).toBe(nvda.address);
  });

  it('takes the fee and tick spacing from the launch record, and our MemeHook as the hook', () => {
    expect(poolKey({ ...tmemeLaunch, poolFee: 3000, tickSpacing: 60 })).toMatchObject({
      fee: 3000,
      tickSpacing: 60,
      hooks: contracts.memeHook,
    });
  });

  it('names the Pool the testnet PoolManager holds for TMEME', () => {
    // StateView getSlot0 answers for this id with TMEME's live price.
    expect(poolId(poolKey(tmemeLaunch))).toBe('0x174b63f3ffc2a74fb4ee804ee401027bd2144ea846de5751f43668069b1d2b0b');
  });
});
