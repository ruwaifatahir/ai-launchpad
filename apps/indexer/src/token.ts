import { ponder } from "ponder:registry";
import { holder, launch } from "ponder:schema";
import { zeroAddress, type Address } from "viem";

import { updateMarketCap } from "./handler-context";
import { isProtocolHolder } from "./protocol-holders";

// Every Transfer of a launch token moves a balance: a mint (from the zero address)
// credits the recipient only, a burn (to the zero address) debits the sender only and
// lowers the launch's supply.
ponder.on("LauncherToken:Transfer", async ({ event, context }) => {
  const { from, to, value } = event.args;
  if (value === 0n) return;

  const token = event.log.address;
  // Missing only for the mint in the launch transaction: the token mints its supply to
  // the curve in its constructor, before the factory emits TokenLaunched. The
  // TokenLaunched handler tags the curve then.
  const launchRow = await context.db.find(launch, { token });

  const adjustBalance = async (wallet: Address, amount: bigint) => {
    await context.db
      .insert(holder)
      .values({
        launch: token,
        wallet,
        balance: amount,
        isProtocol: isProtocolHolder(wallet, launchRow?.curve),
      })
      .onConflictDoUpdate((row) => ({ balance: row.balance + amount }));
  };

  if (from !== zeroAddress) await adjustBalance(from, -value);

  if (to !== zeroAddress) {
    await adjustBalance(to, value);
  } else {
    if (!launchRow) throw new Error(`Burn of ${token} before its launch, in ${event.id}`);
    await context.db
      .update(launch, { token })
      .set((row) => ({ supply: row.supply - value }));
    // Same price, less supply.
    await updateMarketCap(context, token);
  }
});
