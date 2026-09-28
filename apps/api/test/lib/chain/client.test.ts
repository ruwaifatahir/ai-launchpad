import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CallExecutionError,
  ContractFunctionExecutionError,
  ContractFunctionZeroDataError,
  HttpRequestError,
  InternalRpcError,
  LimitExceededRpcError,
  MethodNotFoundRpcError,
  ResourceUnavailableRpcError,
  RpcRequestError,
  TimeoutError,
  zeroAddress,
} from "viem";
import type { BaseError } from "viem";

const { readContract } = vi.hoisted(() => ({
  readContract: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: vi.fn(() => ({ readContract })),
}));

import {
  ChainMisconfiguredError,
  ChainUnreachableError,
  readTokenCreator,
} from "@/lib/chain/client";
import { TEST_ENV } from "@test/helpers/env.mock";

const factory = TEST_ENV.FACTORY_ADDRESS;
const deployer = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e" as const;
const feeRecipient = "0x9999999999999999999999999999999999999999" as const;
const url = "http://localhost:8545";

// The factory's record for one launch, as viem decodes the tuple. A token the factory
// never launched comes back with every field zero and exists false, not as a revert.
const launchRecord = (
  fields: Partial<{
    deployer: string;
    creatorFeeRecipient: string;
    exists: boolean;
  }> = {},
) => ({
  token: "0x1111111111111111111111111111111111111111",
  curve: "0x2222222222222222222222222222222222222222",
  deployer,
  creatorFeeRecipient: feeRecipient,
  pairToken: zeroAddress,
  graduationThreshold: 4_200_000_000_000_000_000n,
  poolFee: 0,
  tickSpacing: 200,
  creatorTaxBps: 100,
  buybackEnabled: true,
  phase: 0,
  sweptQuote: 0n,
  sweptTokens: 0n,
  sweptAt: 0n,
  exists: true,
  ...fields,
});

const unknownToken = () =>
  launchRecord({
    deployer: zeroAddress,
    creatorFeeRecipient: zeroAddress,
    exists: false,
  });

// readContract never throws a bare fault. A failed call passes through getCallError
// and then getContractError, so what a caller catches is a ContractFunctionExecutionError
// wrapping a CallExecutionError wrapping the real one. Every fixture here is built the
// same way. A fixture that skipped the wrappers would let a classifier that never digs
// pass this file and misread every failure in production.
const thrownByReadContract = (cause: BaseError) =>
  new ContractFunctionExecutionError(new CallExecutionError(cause, {}), {
    abi: [],
    functionName: "getLaunchedToken",
  });

// The one fault that arrives without the call wrapper: the call itself succeeded and
// decoding its empty answer is what failed, so getContractError names it directly.
const thrownByDecoding = (cause: BaseError) =>
  new ContractFunctionExecutionError(cause, {
    abi: [],
    functionName: "getLaunchedToken",
  });

const nodeError = (code: number, message: string) =>
  new RpcRequestError({ body: {}, error: { code, message }, url });

const transportFailure = () =>
  thrownByReadContract(new HttpRequestError({ url, details: "fetch failed" }));

const emptyAnswer = () =>
  thrownByDecoding(
    new ContractFunctionZeroDataError({ functionName: "getLaunchedToken" }),
  );

describe("readTokenCreator", () => {
  beforeEach(() => {
    readContract.mockResolvedValue(launchRecord());
  });

  it("reads the creator out of the factory's launch record, because the token itself confers nothing on whoever launched it", async () => {
    const token = "0x1111111111111111111111111111111111111111" as const;

    await expect(readTokenCreator(token)).resolves.toBe(deployer);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: factory,
        functionName: "getLaunchedToken",
        args: [token],
      }),
    );
  });

  it("names the wallet that launched the token, never the fee recipient, because fees can be handed on and the agent stays with the launcher", async () => {
    await expect(
      readTokenCreator("0x1010101010101010101010101010101010101010"),
    ).resolves.not.toBe(feeRecipient);
  });

  it("caches a creator for the life of the process, so a second read of the same token makes no second call", async () => {
    const token = "0x2222222222222222222222222222222222222222" as const;

    await readTokenCreator(token);
    readContract.mockClear();

    await expect(readTokenCreator(token)).resolves.toBe(deployer);
    expect(readContract).not.toHaveBeenCalled();
  });

  it("caches by the token address case insensitively, because a checksummed and a lowercase address are one token", async () => {
    await readTokenCreator("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    readContract.mockClear();

    await readTokenCreator("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

    expect(readContract).not.toHaveBeenCalled();
  });

  it("returns null for a record that does not exist, which is how the factory answers for a token it did not launch", async () => {
    readContract.mockResolvedValue(unknownToken());

    await expect(
      readTokenCreator("0x4444444444444444444444444444444444444444"),
    ).resolves.toBeNull();
  });

  it("never caches a token the factory does not know, because that token may be launched later", async () => {
    const token = "0x5555555555555555555555555555555555555555" as const;

    readContract.mockResolvedValue(unknownToken());
    await readTokenCreator(token);

    readContract.mockResolvedValue(launchRecord());

    await expect(readTokenCreator(token)).resolves.toBe(deployer);
  });

  it("names an unreachable node rather than returning null, so a dead node is never read as a missing token", async () => {
    readContract.mockRejectedValue(transportFailure());

    await expect(
      readTokenCreator("0x6666666666666666666666666666666666666666"),
    ).rejects.toBeInstanceOf(ChainUnreachableError);
  });

  it("names an unreachable node when the node never answered, because a timeout is the same outage as a refused connection", async () => {
    readContract.mockRejectedValue(
      thrownByReadContract(new TimeoutError({ body: {}, url })),
    );

    await expect(
      readTokenCreator("0x6767676767676767676767676767676767676767"),
    ).rejects.toBeInstanceOf(ChainUnreachableError);
  });

  it("names an unreachable node for every node error that means try again, the provider rate limiting us above all", async () => {
    const answered = [
      new LimitExceededRpcError(nodeError(-32005, "rate limited")),
      new ResourceUnavailableRpcError(nodeError(-32002, "resource unavailable")),
      new InternalRpcError(nodeError(-32603, "internal error")),
    ];

    for (const [index, error] of answered.entries()) {
      readContract.mockRejectedValue(thrownByReadContract(error));

      await expect(
        readTokenCreator(`0x686868686868686868686868686868686868686${index}`),
      ).rejects.toBeInstanceOf(ChainUnreachableError);
    }
  });

  it("names a misconfigured factory when the address answers nothing, because that is our wrong address and not an unknown token", async () => {
    readContract.mockRejectedValue(emptyAnswer());

    await expect(
      readTokenCreator("0x7777777777777777777777777777777777777777"),
    ).rejects.toBeInstanceOf(ChainMisconfiguredError);
  });

  it("lets a failure it does not recognise through untouched, so nothing is dressed up as an outage worth retrying", async () => {
    readContract.mockRejectedValue(
      thrownByReadContract(
        new MethodNotFoundRpcError(nodeError(-32601, "no such method")),
      ),
    );

    const failure = await readTokenCreator(
      "0x7878787878787878787878787878787878787878",
    ).catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(ChainUnreachableError);
    expect(failure).not.toBeInstanceOf(ChainMisconfiguredError);
  });

  it("keeps the fault it was given as its cause, so the log names what actually went wrong", async () => {
    const thrown = transportFailure();

    readContract.mockRejectedValue(thrown);

    const failure = await readTokenCreator(
      "0x7979797979797979797979797979797979797979",
    ).catch((error: unknown) => error);

    expect((failure as ChainUnreachableError).cause).toBe(thrown);
  });

  it("caches nothing it could not read, so a token is asked about again once the node is back", async () => {
    const token = "0x7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a" as const;

    readContract.mockRejectedValue(transportFailure());
    await readTokenCreator(token).catch(() => null);

    readContract.mockResolvedValue(launchRecord());

    await expect(readTokenCreator(token)).resolves.toBe(deployer);
  });
});
