import type { Signer } from "ethers";
import { NATIVE } from "../config/pons.js";
import { firstEvent } from "./forkHarness.js";
import { launch, type LaunchOptions, type LaunchResult } from "./launch.js";

export interface GraduatedLaunch extends LaunchResult {
  positionId: bigint;
  seedTokenAmount: bigint;
  seedQuoteAmount: bigint;
}

/**
 * Launches a token and buys it all the way to a seeded V4 pool.
 *
 * Graduation is reached by exhausting the sellable allocation, so the loop buys
 * fixed chunks until `curve.graduated()` flips rather than watching a quote
 * threshold. The crossing buy triggers `factory.graduate()` itself; the explicit
 * call afterwards only covers the case where `_tryAutoGraduate` swallowed a
 * failure. Seeding the pool is always a separate call.
 */
export async function launchAndGraduate(
  ethers: any,
  factory: any,
  launcher: Signer,
  buyer: Signer,
  opts: LaunchOptions & { chunk?: bigint; approveQuote?: any } = {},
): Promise<GraduatedLaunch> {
  const result = await launch(ethers, factory, launcher, opts);
  const { curve, tokenAddress } = result;
  const isNative = (opts.pairToken ?? NATIVE) === NATIVE;
  const chunk = opts.chunk ?? (isNative ? 10n ** 18n : 10n ** 18n);

  let guard = 0;
  while (!(await curve.graduated()) && guard++ < 60) {
    if (isNative) {
      await (await curve.connect(buyer).buy(chunk, 0n, await buyer.getAddress(), { value: chunk })).wait();
    } else {
      await (await opts.approveQuote.connect(buyer).approve(await curve.getAddress(), chunk)).wait();
      await (await curve.connect(buyer).buy(chunk, 0n, await buyer.getAddress())).wait();
    }
  }
  if (!(await curve.graduated())) throw new Error("curve never graduated");

  let launched = await factory.getLaunchedToken(tokenAddress);
  if (launched.phase === 0n) await (await factory.graduate(tokenAddress)).wait();

  const receipt = await (await factory.createGraduatedPool(tokenAddress)).wait();
  const ev = firstEvent(receipt, factory.interface, "PoolGraduated")!;

  return {
    ...result,
    positionId: ev.args[1],
    seedTokenAmount: ev.args[2],
    seedQuoteAmount: ev.args[3],
  };
}
