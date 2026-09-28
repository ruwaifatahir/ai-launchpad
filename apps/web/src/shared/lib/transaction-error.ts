import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem';

/** The user cancelled in their wallet: a choice, not a failure worth reporting. */
export function isUserRejection(error: unknown): boolean {
  return error instanceof BaseError && Boolean(error.walk((e) => e instanceof UserRejectedRequestError));
}

/** A failed transaction's reason, short enough for a toast. */
export function describeTransactionError(error: unknown): string {
  if (error instanceof BaseError) return error.shortMessage;
  return error instanceof Error ? error.message : 'Something went wrong';
}

/** The contract itself reverted the call, as opposed to the network or wallet failing to run it. */
export function isContractRevert(error: unknown): boolean {
  return error instanceof BaseError && Boolean(error.walk((e) => e instanceof ContractFunctionRevertedError));
}
