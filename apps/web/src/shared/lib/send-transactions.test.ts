import type { Hash, TransactionReceipt } from 'viem';
import { describe, expect, it } from 'vitest';
import { sendInOrder, type ContractCall, type TransactionSender } from './send-transactions';

const call = (functionName: string): ContractCall => ({
  address: '0x1111111111111111111111111111111111111111',
  abi: [],
  functionName,
});

/** A wallet that records what it signs; `reverts` names the calls mined as reverted. */
function fakeSender(reverts: string[] = []) {
  const log: string[] = [];
  const sender: TransactionSender = {
    sign: async ({ functionName }) => {
      log.push(`sign ${functionName}`);
      return functionName as Hash;
    },
    confirm: async (hash) => {
      log.push(`confirm ${hash}`);
      return { status: reverts.includes(hash) ? 'reverted' : 'success', transactionHash: hash } as TransactionReceipt;
    },
  };
  return { sender, log };
}

describe('sendInOrder', () => {
  it('signs each call only after the one before it is mined, and returns the last receipt', async () => {
    const { sender, log } = fakeSender();
    const stages: string[] = [];

    const receipt = await sendInOrder(sender, [call('approve'), call('buy')], {
      onStage: (stage, { functionName }) => stages.push(`${stage} ${functionName}`),
      revertMessage: () => 'reverted',
    });

    expect(log).toEqual(['sign approve', 'confirm approve', 'sign buy', 'confirm buy']);
    expect(stages).toEqual(['signing approve', 'confirming approve', 'signing buy', 'confirming buy']);
    expect(receipt.transactionHash).toBe('buy');
  });

  it('stops at a reverted call, with its message, and never sends the rest', async () => {
    const { sender, log } = fakeSender(['approve']);

    await expect(
      sendInOrder(sender, [call('approve'), call('buy')], {
        revertMessage: ({ functionName }) => `The ${functionName} reverted`,
      }),
    ).rejects.toThrow('The approve reverted');
    expect(log).toEqual(['sign approve', 'confirm approve']);
  });

  it('stops when the wallet refuses to sign', async () => {
    const { sender, log } = fakeSender();
    sender.sign = async () => {
      throw new Error('User rejected the request');
    };

    await expect(sendInOrder(sender, [call('buy')], { revertMessage: () => 'reverted' })).rejects.toThrow(
      'User rejected the request',
    );
    expect(log).toEqual([]);
  });
});
