import { describe, expect, it } from 'vitest';
import { contracts } from '@/shared/config';
import { graduationCall } from './graduation';

const token = '0x1111111111111111111111111111111111111111';

describe('graduationCall', () => {
  it('sweeps a sold-out curve through the factory', () => {
    expect(graduationCall(token, 'graduate')).toMatchObject({
      address: contracts.launchFactory,
      functionName: 'graduate',
      args: [token],
    });
  });

  it('creates the Pool of a swept launch through the factory', () => {
    expect(graduationCall(token, 'create-pool')).toMatchObject({
      address: contracts.launchFactory,
      functionName: 'createGraduatedPool',
      args: [token],
    });
  });
});
