import { describe, expect, it } from 'vitest';
import { contracts, pairedAssets, type PairedAsset } from '@/shared/config';
import { claimableCall, claimCall } from './creator-fees';

// `.env.test` pairs launches with ETH and one ERC-20, NVDA, a mintable test token.
const [eth, nvda] = pairedAssets as readonly [PairedAsset, PairedAsset];
const creator = '0x1111111111111111111111111111111111111111';

describe('claimableCall', () => {
  it('reads the ETH owed to the Creator wallet with balanceOf', () => {
    expect(claimableCall(creator, eth)).toMatchObject({
      address: contracts.feeEscrow,
      functionName: 'balanceOf',
      args: [creator],
    });
  });

  it('reads the NVDA owed to the Creator wallet with balanceOfToken', () => {
    expect(claimableCall(creator, nvda)).toMatchObject({
      address: contracts.feeEscrow,
      functionName: 'balanceOfToken',
      args: [creator, nvda.address],
    });
  });
});

describe('claimCall', () => {
  it('claims ETH with claim()', () => {
    expect(claimCall(eth)).toMatchObject({ address: contracts.feeEscrow, functionName: 'claim', args: [] });
  });

  it('claims NVDA with claimToken(pairedAsset)', () => {
    expect(claimCall(nvda)).toMatchObject({
      address: contracts.feeEscrow,
      functionName: 'claimToken',
      args: [nvda.address],
    });
  });
});
