import { hexlify, randomBytes, type Signer } from "ethers";
import { NATIVE } from "../config/pons.js";
import { firstEvent } from "./forkHarness.js";

/**
 * The overload is picked explicitly: PonsV2LaunchFactory has both a 3-arg and a
 * 4-arg launchToken, so ethers needs the full signature to disambiguate.
 */
const LAUNCH_SIG =
  "launchToken((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address)";

export interface LaunchOptions {
  name?: string;
  symbol?: string;
  creatorFeeRecipient?: string;
  creatorTaxBps?: number;
  buybackEnabled?: boolean;
  launchConfigId?: bigint;
  pairToken?: string;
  /** Pass bytes32(0) to skip the economics pin, or omit to pin to the current preview. */
  expectedEconomics?: string;
  salt?: string;
}

export interface LaunchResult {
  tokenAddress: string;
  curveAddress: string;
  token: any;
  curve: any;
  receipt: any;
}

/** Launches one token through the factory and returns attached contracts. */
export async function launch(
  ethers: any,
  factory: any,
  launcher: Signer,
  opts: LaunchOptions = {},
): Promise<LaunchResult> {
  const configId = opts.launchConfigId ?? 0n;
  const pairToken = opts.pairToken ?? NATIVE;
  const expectedEconomics =
    opts.expectedEconomics ?? (await factory.previewLaunchEconomics(configId, pairToken));

  const params = {
    name: opts.name ?? "Scenario",
    symbol: opts.symbol ?? "SCN",
    logo: "",
    description: "",
    socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
    creatorFeeRecipient: opts.creatorFeeRecipient ?? (await launcher.getAddress()),
    creatorTaxBps: opts.creatorTaxBps ?? 100,
    buybackEnabled: opts.buybackEnabled ?? true,
    expectedEconomics,
    salt: opts.salt ?? hexlify(randomBytes(32)),
  };

  const asLauncher = factory.connect(launcher);
  const receipt = await (
    await asLauncher[LAUNCH_SIG](params, configId, pairToken, { value: await factory.launchFee() })
  ).wait();

  const ev = firstEvent(receipt, factory.interface, "TokenLaunched");
  if (!ev) throw new Error("TokenLaunched not emitted");

  const tokenAddress: string = ev.args.token;
  const curveAddress: string = ev.args.curve;
  return {
    tokenAddress,
    curveAddress,
    token: await ethers.getContractAt("PonsV2LauncherToken", tokenAddress),
    curve: await ethers.getContractAt("PonsV2BondingCurve", curveAddress),
    receipt,
  };
}

/** Builds the launchToken calldata without sending it, for revert testing. */
export function launchSignature(): string {
  return LAUNCH_SIG;
}
