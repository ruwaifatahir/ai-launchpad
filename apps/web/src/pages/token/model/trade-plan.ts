import { erc20Abi, parseUnits, type Address, type ContractFunctionArgs } from 'viem';
import { bondingCurveAbi, permit2Abi, universalRouterAbi } from '@/shared/api';
import { isNativeAsset, uniswap } from '@/shared/config';
import type { TokenStage } from './token-stage';
import { encodePoolSwap, type PoolKey } from './uniswap-pool';

const BPS = 10_000n;

/** The hidden price limit on every trade: the trade reverts rather than fill below 99% of the quote. */
const MIN_OUT_BPS = 9_900n;

/**
 * The fee, Creator tax and Snipe tax together always leave at least this much of a buy for the
 * curve, so the curve caps the Snipe tax to fit.
 */
const MIN_NET_BPS = 100n;

/**
 * The gas limit on an ERC-20 buy. The buy that sells out the curve also sweeps it for Graduation,
 * which the wallet's estimate can leave short; a starved sweep leaves the token waiting on a
 * separate `graduate` call.
 */
const ERC20_BUY_GAS = 6_000_000n;

/**
 * How long a Pool swap stays valid after it is planned, in seconds. Its Permit2 approval lasts as
 * long, so it can't expire before the swap it was made for.
 */
const SWAP_DEADLINE_SECONDS = 30 * 60;

/** What the curve prices a buy against, read from it for the Connected wallet. */
export type CurveTerms = {
  address: Address;
  /** `getReserves()`: the phantom reserve included, pending fees excluded. */
  quoteReserve: bigint;
  tokenReserve: bigint;
  /** Tokens left before the curve sells out. */
  sellableTokens: bigint;
  feeBps: number;
  creatorTaxBps: number;
  /** `currentSnipeTaxBps(wallet)`, before the curve caps it. */
  snipeTaxBps: number;
};

/** The token's side of a trade. */
export type TradeMarket = {
  stage: Exclude<TokenStage, { kind: 'not-found' }>;
  token: TradeAsset;
  pair: TradeAsset;
  /** `null` off the Bonding curve, and until the curve's first read lands. */
  curve: CurveTerms | null;
  /** The Pool's key; `null` off the Pool stage. */
  pool: PoolKey | null;
};

type TradeAsset = { address: Address; symbol: string; decimals: number };

/** Buying spends the Paired asset for the token; selling spends the token for the Paired asset. */
export type TradeSide = 'buy' | 'sell';

/** An amount of each asset in the trade, in base units. */
export type TradeAmounts = { paired: bigint; token: bigint };

/** What Permit2 lets the UniversalRouter pull of one asset, and until when (unix seconds). */
export type Permit2Allowance = { amount: bigint; expiration: number };

/** What Permit2 lets the UniversalRouter pull of each asset in the trade. */
export type Permit2Allowances = { paired: Permit2Allowance; token: Permit2Allowance };

/**
 * The V4Quoter's answer for one amount in the Pool. `amountOut` is `null` when there is no quote:
 * `failure` says whether the quoter refused the amount or never answered.
 */
export type PoolQuote = { side: TradeSide; amountIn: bigint } & (
  { amountOut: bigint } | { amountOut: null; failure: 'refused' | 'unreachable' }
);

/** What a quote needs: the amount as typed, the wallet's balances once read and, in the Pool, the V4Quoter's answer. */
export type TradeQuoteRequest = {
  side: TradeSide;
  /** In the asset spent: the Paired asset on a buy, the token on a sell. */
  amount: string;
  balances?: TradeAmounts | undefined;
  /** In the Pool: the V4Quoter's quote, which counts only when it is for the amount typed. */
  poolQuote?: PoolQuote | undefined;
};

/** What sending a trade needs besides its quote: the wallet, what it has approved, and the time. */
export type TradeRequest = TradeQuoteRequest & {
  wallet: Address;
  /**
   * What the wallet lets the market pull of each asset: the curve on the Bonding curve, Permit2 in
   * the Pool. An approval comes first when it is short.
   */
  allowances?: TradeAmounts | undefined;
  /** In the Pool: what Permit2 lets the UniversalRouter pull of each asset. */
  permit2Allowances?: Permit2Allowances | undefined;
  /** Unix seconds when the trade is planned, from which the Pool swap's deadline runs. */
  now: number;
};

/**
 * What the trade gives, in base units. The fee and taxes are the Bonding curve's; in the Pool they
 * are zero, since the V4Quoter's `amountOut` already has the hook fee taken out.
 */
export type TradeQuote = {
  /** What the market keeps; below the amount sent when a capped buy is refunded the rest. */
  amountIn: bigint;
  amountOut: bigint;
  /** The least the trade accepts: 99% of `amountOut`. */
  minOut: bigint;
  fee: bigint;
  creatorTax: bigint;
  snipeTax: bigint;
  /** The Snipe tax rate charged, after the curve's cap. */
  snipeTaxBps: number;
  /** The buy asked for more than the tokens left, so it gets exactly those. */
  capped: boolean;
};

/** A call to send, in order, ready for `writeContract`. */
export type TradeTransaction =
  | {
      address: Address;
      abi: typeof erc20Abi;
      functionName: 'approve';
      args: ContractFunctionArgs<typeof erc20Abi, 'nonpayable', 'approve'>;
    }
  | {
      address: Address;
      abi: typeof bondingCurveAbi;
      functionName: 'buy';
      args: ContractFunctionArgs<typeof bondingCurveAbi, 'payable', 'buy'>;
      value: bigint;
      /** Set when the estimate can't be trusted; see `ERC20_BUY_GAS`. */
      gas?: bigint;
    }
  | {
      address: Address;
      abi: typeof bondingCurveAbi;
      functionName: 'sell';
      args: ContractFunctionArgs<typeof bondingCurveAbi, 'nonpayable', 'sell'>;
    }
  | Permit2Approval
  | {
      address: Address;
      abi: typeof universalRouterAbi;
      functionName: 'execute';
      args: ContractFunctionArgs<typeof universalRouterAbi, 'payable', 'execute'>;
      value: bigint;
    };

/** Permit2's own approval of the UniversalRouter, which pulls ERC-20 input through Permit2. */
type Permit2Approval = {
  address: Address;
  abi: typeof permit2Abi;
  functionName: 'approve';
  args: ContractFunctionArgs<typeof permit2Abi, 'nonpayable', 'approve'>;
};

/** Tells Permit2's approval apart from an ERC-20 approval, which shares its name. */
export const isPermit2Approval = (transaction: TradeTransaction): transaction is Permit2Approval =>
  transaction.abi === permit2Abi;

/** What a transaction does, for the wallet prompt: approve an ERC-20, approve through Permit2, or trade. */
export type TradeStep = 'approve' | 'permit2' | 'trade';

export function tradeStep(transaction: TradeTransaction): TradeStep {
  if (isPermit2Approval(transaction)) return 'permit2';
  return transaction.functionName === 'approve' ? 'approve' : 'trade';
}

/** Why a trade can't be made yet, or at all. The UI words each reason. */
export type TradeBlock =
  | { reason: 'graduation-pending' }
  | { reason: 'rescued' }
  | { reason: 'reading-curve' }
  | { reason: 'reading-pool' }
  | { reason: 'reading-balances' }
  | { reason: 'no-amount' }
  | { reason: 'quoting' }
  /** The V4Quoter refused this amount. */
  | { reason: 'no-quote' }
  /** The V4Quoter didn't answer; the next refresh asks again. */
  | { reason: 'quote-unavailable' }
  /** So small that a 99% price limit would accept nothing. */
  | { reason: 'too-small' }
  | { reason: 'insufficient-balance'; symbol: string };

/** A trade that can't be made, with its quote when only the balance is short or the amount too small. */
export type TradeRefusal = { ok: false; block: TradeBlock; quote: TradeQuote | null };

/** Where a trade fills: the Bonding curve, or the Pool through the UniversalRouter. */
export type TradeVenue = { kind: 'curve'; curve: CurveTerms } | { kind: 'pool'; key: PoolKey };

/**
 * A typed trade's quote, what the wallet sends (the amount typed; a capped buy is refunded the rest)
 * and where it fills. Needs no wallet and no clock, so it is safe to work out on every render.
 */
export type TradeQuoteResult = { ok: true; quote: TradeQuote; sent: bigint; venue: TradeVenue } | TradeRefusal;

/** A typed trade's quote and the transactions that make it. */
export type TradePlan = { ok: true; quote: TradeQuote; transactions: TradeTransaction[] } | TradeRefusal;

/**
 * A typed decimal in base units, or `undefined` when it isn't a positive amount the asset can hold.
 * Checked by hand because `parseUnits` rounds extra decimals instead of failing.
 */
export function parseAmount(text: string, decimals: number): bigint | undefined {
  const value = text.trim();
  const match = /^(\d*)(?:\.(\d*))?$/.exec(value);
  if (!value || !match || value === '.' || (match[2]?.length ?? 0) > decimals) return undefined;
  const amount = parseUnits(value, decimals);
  return amount > 0n ? amount : undefined;
}

/** Each tax the curve takes from `spent`, in basis points. */
type BuyTaxes = { feeBps: bigint; creatorTaxBps: bigint; snipeTaxBps: bigint };

function taxesOn(spent: bigint, taxes: BuyTaxes) {
  const fee = (spent * taxes.feeBps) / BPS;
  const creatorTax = (spent * taxes.creatorTaxBps) / BPS;
  const snipeTax = (spent * taxes.snipeTaxBps) / BPS;
  return { fee, creatorTax, snipeTax, net: spent - fee - creatorTax - snipeTax };
}

/** The Snipe tax rate a buy pays right now: the wallet's current rate, capped to leave the curve its 1%. */
export function chargedSnipeTaxBps(curve: CurveTerms): number {
  const max = Number(BPS - MIN_NET_BPS) - curve.feeBps - curve.creatorTaxBps;
  return Math.max(0, Math.min(curve.snipeTaxBps, max));
}

/**
 * The curve's own buy math, in the same integer steps so the quote is exact: the taxes come off
 * the amount spent and the rest buys at the constant-product price. A buy past the tokens left gets
 * exactly those, and spends only the grossed-up amount that buys them.
 */
function quoteBuy(curve: CurveTerms, quoteIn: bigint): TradeQuote {
  const feeBps = BigInt(curve.feeBps);
  const creatorTaxBps = BigInt(curve.creatorTaxBps);
  const snipeTaxBps = BigInt(chargedSnipeTaxBps(curve));
  const taxes = { feeBps, creatorTaxBps, snipeTaxBps };
  const { quoteReserve, tokenReserve, sellableTokens: tokensLeft } = curve;

  let spent = quoteIn;
  let charged = taxesOn(spent, taxes);
  let amountOut = (charged.net * tokenReserve) / (quoteReserve + charged.net);
  const capped = amountOut > tokensLeft;
  if (capped) {
    amountOut = tokensLeft;
    const netNeeded = (tokensLeft * quoteReserve) / (tokenReserve - tokensLeft) + 1n;
    const netBps = BPS - feeBps - creatorTaxBps - snipeTaxBps;
    spent = (netNeeded * BPS + netBps - 1n) / netBps;
    charged = taxesOn(spent, taxes);
  }

  return {
    amountIn: spent,
    amountOut,
    minOut: (amountOut * MIN_OUT_BPS) / BPS,
    fee: charged.fee,
    creatorTax: charged.creatorTax,
    snipeTax: charged.snipeTax,
    snipeTaxBps: Number(snipeTaxBps),
    capped,
  };
}

/**
 * The curve's own sell math: the tokens sell at the constant-product price, then the fee and
 * Creator tax both come off that gross amount. A sell pays no Snipe tax.
 */
function quoteSell(curve: CurveTerms, tokensIn: bigint): TradeQuote {
  const gross = (tokensIn * curve.quoteReserve) / (curve.tokenReserve + tokensIn);
  const fee = (gross * BigInt(curve.feeBps)) / BPS;
  const creatorTax = (gross * BigInt(curve.creatorTaxBps)) / BPS;
  const amountOut = gross - fee - creatorTax;
  return {
    amountIn: tokensIn,
    amountOut,
    minOut: (amountOut * MIN_OUT_BPS) / BPS,
    fee,
    creatorTax,
    snipeTax: 0n,
    snipeTaxBps: 0,
    capped: false,
  };
}

const refuse = (block: TradeBlock, quote: TradeQuote | null = null): TradeRefusal => ({ ok: false, block, quote });

/** Why the token can't be traded at its stage, or `null` when it can. */
function stageBlock(stage: TradeMarket['stage']): TradeBlock | null {
  switch (stage.kind) {
    case 'bonding-curve':
    case 'pool':
      return null;
    case 'graduation-pending':
      return { reason: 'graduation-pending' };
    case 'rescued':
      return { reason: 'rescued' };
  }
}

/** An exact approval of `amount` of `asset` to `spender`, or none when the allowance already covers it. */
function approvalFor(
  asset: Address,
  spender: Address,
  amount: bigint,
  allowance: bigint | undefined,
): TradeTransaction[] {
  // An allowance not yet read counts as short: an extra approval is safer than a reverted trade.
  if (allowance !== undefined && allowance >= amount) return [];
  return [{ address: asset, abi: erc20Abi, functionName: 'approve', args: [spender, amount] }];
}

/**
 * An exact Permit2 approval of `amount` of `asset` to the router until `deadline`, or none when
 * Permit2 already lets the router pull that much until then.
 */
function permit2ApprovalFor(
  asset: Address,
  amount: bigint,
  deadline: number,
  allowance: Permit2Allowance | undefined,
): TradeTransaction[] {
  if (allowance && allowance.amount >= amount && allowance.expiration >= deadline) return [];
  return [
    {
      address: uniswap.permit2,
      abi: permit2Abi,
      functionName: 'approve',
      args: [asset, uniswap.universalRouter, amount, deadline],
    },
  ];
}

/**
 * The typed trade's quote, or why it can't be made: the stage is closed, the market or quote is
 * still being read, the amount is missing or too small, or the balance is short.
 */
export function quoteTrade(market: TradeMarket, request: TradeQuoteRequest): TradeQuoteResult {
  const closed = stageBlock(market.stage);
  if (closed) return refuse(closed);
  const venue = tradeVenue(market);
  if (!venue) return refuse({ reason: market.stage.kind === 'pool' ? 'reading-pool' : 'reading-curve' });

  const selling = request.side === 'sell';
  const spent = selling ? market.token : market.pair;
  const sent = parseAmount(request.amount, spent.decimals);
  if (sent === undefined) return refuse({ reason: 'no-amount' });

  const quoted = venue.kind === 'pool' ? quotePool(request, sent) : quoteCurve(venue.curve, request.side, sent);
  if (!quoted.ok) return quoted;
  const { quote } = quoted;
  // A dust trade would ask for at least nothing, so no price limit would protect it.
  if (quote.minOut === 0n) return refuse({ reason: 'too-small' }, quote);
  const balance = request.balances?.[selling ? 'token' : 'paired'];
  if (balance !== undefined && sent > balance) {
    return refuse({ reason: 'insufficient-balance', symbol: spent.symbol }, quote);
  }
  return { ok: true, quote, sent, venue };
}

/** The market the stage trades on, or `null` while it is still being read. */
function tradeVenue(market: TradeMarket): TradeVenue | null {
  if (market.stage.kind === 'pool') return market.pool && { kind: 'pool', key: market.pool };
  return market.curve && { kind: 'curve', curve: market.curve };
}

/** The V4Quoter's answer as a quote, once it is for the amount typed. In the Pool the hook fee is already out. */
function quotePool(request: TradeQuoteRequest, amountIn: bigint): { ok: true; quote: TradeQuote } | TradeRefusal {
  const quoted = request.poolQuote;
  if (!quoted || quoted.side !== request.side || quoted.amountIn !== amountIn) return refuse({ reason: 'quoting' });
  if (quoted.amountOut === null) {
    return refuse({ reason: quoted.failure === 'refused' ? 'no-quote' : 'quote-unavailable' });
  }
  return {
    ok: true,
    quote: {
      amountIn,
      amountOut: quoted.amountOut,
      minOut: (quoted.amountOut * MIN_OUT_BPS) / BPS,
      fee: 0n,
      creatorTax: 0n,
      snipeTax: 0n,
      snipeTaxBps: 0,
      capped: false,
    },
  };
}

/** The curve's own math for the amount typed. */
function quoteCurve(curve: CurveTerms, side: TradeSide, amountIn: bigint): { ok: true; quote: TradeQuote } {
  return { ok: true, quote: side === 'sell' ? quoteSell(curve, amountIn) : quoteBuy(curve, amountIn) };
}

/** Turns a typed trade into its quote and the transactions that make it, or the reason it can't be made. */
export function planTrade(market: TradeMarket, request: TradeRequest): TradePlan {
  const quoted = quoteTrade(market, request);
  if (!quoted.ok) return quoted;
  const { venue } = quoted;
  const transactions =
    venue.kind === 'pool'
      ? poolTransactions(market, request, venue.key, quoted)
      : curveTransactions(market, request, venue.curve, quoted);
  return { ok: true, quote: quoted.quote, transactions };
}

type Quoted = Extract<TradeQuoteResult, { ok: true }>;

/**
 * A buy or sell in the Pool at the V4Quoter's price, through the UniversalRouter. ETH goes as
 * value. An ERC-20 spent (an ERC-20 Paired asset on a buy, the token on a sell) is pulled through Permit2, so it is
 * approved exactly to Permit2, then Permit2 approves the router, each only when short.
 */
function poolTransactions(
  market: TradeMarket,
  request: TradeRequest,
  key: PoolKey,
  { quote, sent }: Quoted,
): TradeTransaction[] {
  const selling = request.side === 'sell';
  const spentKey = selling ? 'token' : 'paired';
  const spent = selling ? market.token : market.pair;
  const deadline = request.now + SWAP_DEADLINE_SECONDS;
  const native = isNativeAsset(spent);
  const swap: TradeTransaction = {
    address: uniswap.universalRouter,
    abi: universalRouterAbi,
    functionName: 'execute',
    args: encodePoolSwap({
      key,
      currencyIn: spent.address,
      amountIn: sent,
      minOut: quote.minOut,
      deadline: BigInt(deadline),
    }),
    value: native ? sent : 0n,
  };
  if (native) return [swap];
  return [
    ...approvalFor(spent.address, uniswap.permit2, sent, request.allowances?.[spentKey]),
    ...permit2ApprovalFor(spent.address, sent, deadline, request.permit2Allowances?.[spentKey]),
    swap,
  ];
}

/** A buy or sell on the Bonding curve, at the curve's own math. */
function curveTransactions(
  market: TradeMarket,
  request: TradeRequest,
  curve: CurveTerms,
  { quote, sent }: Quoted,
): TradeTransaction[] {
  const { token, pair } = market;
  if (request.side === 'sell') {
    return [
      ...approvalFor(token.address, curve.address, sent, request.allowances?.token),
      {
        address: curve.address,
        abi: bondingCurveAbi,
        functionName: 'sell',
        args: [sent, quote.minOut, request.wallet],
      },
    ];
  }

  // A capped buy still sends the whole amount: the curve refunds what it doesn't use.
  const buyArgs = [sent, quote.minOut, request.wallet] as const;
  if (isNativeAsset(pair)) {
    return [{ address: curve.address, abi: bondingCurveAbi, functionName: 'buy', args: buyArgs, value: sent }];
  }
  return [
    ...approvalFor(pair.address, curve.address, sent, request.allowances?.paired),
    { address: curve.address, abi: bondingCurveAbi, functionName: 'buy', args: buyArgs, value: 0n, gas: ERC20_BUY_GAS },
  ];
}
