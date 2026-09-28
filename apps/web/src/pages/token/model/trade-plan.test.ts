import { decodeAbiParameters, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { pairedAssets, uniswap, type PairedAsset } from '@/shared/config';
import {
  planTrade,
  quoteTrade,
  type CurveTerms,
  type TradeMarket,
  type TradeRequest,
  type TradeTransaction,
} from './trade-plan';
import { poolKey } from './uniswap-pool';

// `.env.test` pairs launches with ETH and one ERC-20, NVDA, a mintable test token.
const [eth, nvda] = pairedAssets as readonly [PairedAsset, PairedAsset];

const E18 = 10n ** 18n;
const WALLET = '0x1111111111111111111111111111111111111111';
const CURVE = '0x015995dbe2510047C53078aeFE983f69b2CcCef2';
const TOKEN = '0x2222222222222222222222222222222222222222';
/** Unix seconds when the trade is planned. */
const NOW = 1_790_000_000;

/**
 * TMEME's curve (0x0159…cEf2) on our testnet, just before its first buy (tx 0x8bce…d078): the
 * launch's phantom reserve against the full supply, a 1% curve fee and a 1% Creator tax.
 */
const freshCurve: CurveTerms = {
  address: CURVE,
  quoteReserve: 16_640_000_000_000_000_000n,
  tokenReserve: 1_000_000_000n * E18,
  sellableTokens: 714_285_714_285_714_285_714_285_715n,
  feeBps: 100,
  creatorTaxBps: 100,
  snipeTaxBps: 0,
};

/** The same curve just before the buy that sold it out (tx 0x1e9e…39d9). */
const lastTokensCurve: CurveTerms = {
  ...freshCurve,
  quoteReserve: 49_463_005_877_413_937_868n,
  tokenReserve: 336_413_036_466_880_912_795_566_689n,
  sellableTokens: 50_698_750_752_595_198_509_852_404n,
};

/** The same curve after its first buy, just before the first sell (tx 0x2ea2…d916). */
const afterFirstBuyCurve: CurveTerms = {
  ...freshCurve,
  // The first buy's 5, less its 0.05 fee and 0.05 Creator tax, joined the phantom reserve.
  quoteReserve: 21_540_000_000_000_000_000n,
  tokenReserve: 1_000_000_000n * E18 - 227_483_751_160_631_383_472_609_099n,
};

const market = (curve: Partial<CurveTerms> = {}, overrides: Partial<TradeMarket> = {}): TradeMarket => ({
  stage: { kind: 'bonding-curve' },
  token: { address: TOKEN, symbol: 'TMEME', decimals: 18 },
  pair: eth,
  curve: { ...freshCurve, ...curve },
  pool: null,
  ...overrides,
});

const request = (overrides: Partial<TradeRequest> = {}): TradeRequest => ({
  side: 'buy',
  amount: '1',
  wallet: WALLET,
  balances: { paired: 100n * E18, token: 1_000_000_000n * E18 },
  allowances: { paired: 0n, token: 0n },
  now: NOW,
  ...overrides,
});

const nvdaMarket = () => market({}, { pair: nvda });

/** Sells the TMEME the first sell on the testnet curve sold (tx 0x2ea2…d916). */
const sell = (overrides: Partial<TradeRequest> = {}) =>
  request({ side: 'sell', amount: '56870937.790157845868152274', ...overrides });

describe('planTrade: buying on the Bonding curve with ETH', () => {
  it('quotes the tokens the curve gave a real buy, after the curve fee and Creator tax', () => {
    // CurveBuy in tx 0x8bce…d078: 5 in, 0.05 fee, 0.05 Creator tax, 227,483,751.16… tokens out.
    // The curve math is the same for every Paired asset, so the NVDA buy prices an ETH pair too.
    const plan = planTrade(market(), request({ amount: '5' }));

    expect(plan).toMatchObject({
      ok: true,
      quote: {
        amountIn: 5n * E18,
        amountOut: 227_483_751_160_631_383_472_609_099n,
        fee: 50_000_000_000_000_000n,
        creatorTax: 50_000_000_000_000_000n,
        snipeTax: 0n,
        snipeTaxBps: 0,
        capped: false,
      },
    });
  });

  it('sends buy(quoteIn, minOut, wallet) to the curve, carrying the ETH as value', () => {
    const plan = planTrade(market(), request({ amount: '5' }));

    expect(plan).toMatchObject({
      ok: true,
      transactions: [
        {
          address: CURVE,
          functionName: 'buy',
          args: [5n * E18, 225_208_913_649_025_069_637_883_008n, WALLET],
          value: 5n * E18,
        },
      ],
    });
  });

  it('asks for at least 99% of the quote, the hidden 1% limit', () => {
    const plan = planTrade(market(), request({ amount: '5' }));
    if (!plan.ok) throw new Error(plan.block.reason);

    // 227,483,751.16… × 9900 / 10000, rounded down.
    expect(plan.quote.minOut).toBe(225_208_913_649_025_069_637_883_008n);
  });

  it('needs no approval and keeps the estimated gas limit', () => {
    const plan = planTrade(market(), request({ amount: '5' }));
    if (!plan.ok) throw new Error(plan.block.reason);

    expect(plan.transactions).toHaveLength(1);
    expect(plan.transactions[0]).not.toHaveProperty('gas');
  });
});

describe('planTrade: buying on the Bonding curve with NVDA', () => {
  it('quotes with the same curve math as ETH', () => {
    expect(planTrade(nvdaMarket(), request({ amount: '5' }))).toMatchObject({
      ok: true,
      quote: { amountIn: 5n * E18, amountOut: 227_483_751_160_631_383_472_609_099n },
    });
  });

  it('approves exactly the NVDA spent to the curve when the allowance is short, then buys', () => {
    const plan = planTrade(nvdaMarket(), request({ amount: '5', allowances: { paired: 5n * E18 - 1n, token: 0n } }));

    expect(plan).toMatchObject({
      ok: true,
      transactions: [
        { address: nvda.address, functionName: 'approve', args: [CURVE, 5n * E18] },
        { address: CURVE, functionName: 'buy' },
      ],
    });
  });

  it('skips the approval when the allowance already covers the buy', () => {
    const plan = planTrade(nvdaMarket(), request({ amount: '5', allowances: { paired: 5n * E18, token: 0n } }));

    expect(plan).toMatchObject({ ok: true, transactions: [{ address: CURVE, functionName: 'buy' }] });
  });

  it('sends the buy with no value and a raised gas limit, so auto-graduation is not starved of gas', () => {
    const plan = planTrade(nvdaMarket(), request({ amount: '5', allowances: { paired: 5n * E18, token: 0n } }));

    expect(plan).toMatchObject({
      ok: true,
      transactions: [
        {
          functionName: 'buy',
          args: [5n * E18, 225_208_913_649_025_069_637_883_008n, WALLET],
          value: 0n,
          gas: 6_000_000n,
        },
      ],
    });
  });

  it('refuses an amount above the NVDA balance', () => {
    const plan = planTrade(nvdaMarket(), request({ amount: '5', balances: { paired: 4n * E18, token: 0n } }));

    expect(plan).toMatchObject({ ok: false, block: { reason: 'insufficient-balance', symbol: 'NVDA' } });
  });
});

describe('planTrade: selling on the Bonding curve', () => {
  // CurveSell in tx 0x2ea2…d916: 56,870,937.79… TMEME in, 1.447454240134340890 out after 1% fee and 1% Creator tax.
  const TOKENS_IN = 56_870_937_790_157_845_868_152_274n;

  it('quotes the Paired asset a real sell got: gross out, less the fee and Creator tax taken on the gross', () => {
    const plan = planTrade(market(afterFirstBuyCurve), sell());

    expect(plan).toMatchObject({
      ok: true,
      quote: {
        amountIn: TOKENS_IN,
        amountOut: 1_447_454_240_134_340_890n,
        fee: 14_769_941_225_860_621n,
        creatorTax: 14_769_941_225_860_621n,
        snipeTax: 0n,
        capped: false,
      },
    });
  });

  it('pays no Snipe tax on a sell', () => {
    const plan = planTrade(market({ ...afterFirstBuyCurve, snipeTaxBps: 5000 }), sell());

    expect(plan).toMatchObject({ ok: true, quote: { snipeTax: 0n, amountOut: 1_447_454_240_134_340_890n } });
  });

  it('approves exactly the tokens sold to the curve when the allowance is short, then sells with the 1% limit', () => {
    const plan = planTrade(market(afterFirstBuyCurve), sell({ allowances: { paired: 0n, token: TOKENS_IN - 1n } }));

    expect(plan).toMatchObject({
      ok: true,
      transactions: [
        { address: TOKEN, functionName: 'approve', args: [CURVE, TOKENS_IN] },
        {
          address: CURVE,
          functionName: 'sell',
          // 1.447454240134340890 × 9900 / 10000, rounded down.
          args: [TOKENS_IN, 1_432_979_697_732_997_481n, WALLET],
        },
      ],
    });
  });

  it('skips the approval when the allowance already covers the sell', () => {
    const plan = planTrade(market(afterFirstBuyCurve), sell({ allowances: { paired: 0n, token: TOKENS_IN } }));

    expect(plan).toMatchObject({ ok: true, transactions: [{ functionName: 'sell' }] });
    if (plan.ok) expect(plan.transactions).toHaveLength(1);
  });

  it('sells the same way against an NVDA pair', () => {
    const plan = planTrade(market(afterFirstBuyCurve, { pair: nvda }), sell());

    expect(plan).toMatchObject({
      ok: true,
      quote: { amountOut: 1_447_454_240_134_340_890n },
      transactions: [{ address: TOKEN, functionName: 'approve' }, { functionName: 'sell' }],
    });
  });

  it('refuses to sell more than the token balance, still showing the quote', () => {
    const plan = planTrade(
      market(afterFirstBuyCurve),
      sell({ balances: { paired: 100n * E18, token: TOKENS_IN - 1n } }),
    );

    expect(plan).toMatchObject({
      ok: false,
      block: { reason: 'insufficient-balance', symbol: 'TMEME' },
      quote: { amountOut: 1_447_454_240_134_340_890n },
    });
  });

  it('allows selling the whole balance', () => {
    expect(planTrade(market(afterFirstBuyCurve), sell({ balances: { paired: 0n, token: TOKENS_IN } })).ok).toBe(true);
  });

  it('refuses a sell too small to get anything back, which no price limit would protect', () => {
    expect(planTrade(market(afterFirstBuyCurve), sell({ amount: '0.000000000000000001' }))).toMatchObject({
      ok: false,
      block: { reason: 'too-small' },
    });
  });

  it('asks for an amount when it is empty or zero', () => {
    for (const amount of ['', '0']) {
      expect(planTrade(market(), sell({ amount }))).toMatchObject({ ok: false, block: { reason: 'no-amount' } });
    }
  });
});

describe('planTrade: Snipe tax', () => {
  it('takes the Snipe tax from the amount spent, before pricing the rest', () => {
    const plan = planTrade(market({ feeBps: 100, creatorTaxBps: 0, snipeTaxBps: 5000 }), request({ amount: '1' }));

    // net = 1 − 0.01 fee − 0.5 Snipe tax = 0.49; out = 0.49 × 1e27 / (16.64 + 0.49).
    expect(plan).toMatchObject({
      ok: true,
      quote: {
        fee: 10_000_000_000_000_000n,
        creatorTax: 0n,
        snipeTax: 500_000_000_000_000_000n,
        snipeTaxBps: 5000,
        amountOut: 28_604_786_923_525_977_816_695_855n,
      },
    });
  });

  it('caps the Snipe tax so the fee, Creator tax and Snipe tax leave at least 1%', () => {
    // 99% Snipe tax right after Launch, with a 1% fee and 1% Creator tax: capped at 97%.
    const plan = planTrade(market({ snipeTaxBps: 9900 }), request({ amount: '1' }));

    // net = 1 − 0.01 − 0.01 − 0.97 = 0.01; out = 0.01 × 1e27 / 16.65.
    expect(plan).toMatchObject({
      ok: true,
      quote: {
        snipeTax: 970_000_000_000_000_000n,
        snipeTaxBps: 9700,
        amountOut: 600_600_600_600_600_600_600_600n,
      },
    });
  });
});

describe('planTrade: a buy larger than the tokens left', () => {
  it('matches the real buy that sold out the curve: capped output, grossed-up spend, the rest refunded', () => {
    // CurveBuy in tx 0x1e9e…39d9: 10 sent, 8.956116451618430749 used, every token left bought.
    const plan = planTrade(market(lastTokensCurve), request({ amount: '10' }));

    expect(plan).toMatchObject({
      ok: true,
      quote: {
        amountIn: 8_956_116_451_618_430_749n,
        amountOut: 50_698_750_752_595_198_509_852_404n,
        fee: 89_561_164_516_184_307n,
        creatorTax: 89_561_164_516_184_307n,
        capped: true,
      },
    });
  });

  it('still sends the whole typed amount, since the curve refunds what it does not use', () => {
    const plan = planTrade(market(lastTokensCurve), request({ amount: '10' }));

    expect(plan).toMatchObject({
      ok: true,
      transactions: [{ args: [10n * E18, 50_191_763_245_069_246_524_753_879n, WALLET], value: 10n * E18 }],
    });
  });
});

describe('quoteTrade', () => {
  it('quotes what planTrade quotes, without a wallet, allowances or the time', () => {
    const { wallet: _wallet, allowances: _allowances, now: _now, ...typed } = request({ amount: '5' });
    const plan = planTrade(market(), request({ amount: '5' }));

    expect(quoteTrade(market(), typed)).toMatchObject({ ok: true, quote: plan.ok && plan.quote, sent: 5n * E18 });
  });
});

describe('planTrade: why the button is blocked', () => {
  it('asks for an amount when it is empty, zero or not a number', () => {
    for (const amount of ['', '  ', '0', '0.000', '.', 'abc', '-1', '1.2.3', '0.0000000000000000001']) {
      expect(planTrade(market(), request({ amount }))).toMatchObject({ ok: false, block: { reason: 'no-amount' } });
    }
  });

  it('refuses an amount above the ETH balance, still showing the quote', () => {
    const plan = planTrade(market(), request({ amount: '5', balances: { paired: 4n * E18, token: 0n } }));

    expect(plan).toMatchObject({
      ok: false,
      block: { reason: 'insufficient-balance', symbol: 'ETH' },
      quote: { amountOut: 227_483_751_160_631_383_472_609_099n },
    });
  });

  it('allows spending the whole balance', () => {
    expect(planTrade(market(), request({ amount: '5', balances: { paired: 5n * E18, token: 0n } })).ok).toBe(true);
  });

  it('quotes without balances, before they are read', () => {
    expect(planTrade(market(), request({ balances: undefined })).ok).toBe(true);
  });

  it('waits for the curve before quoting', () => {
    expect(planTrade(market({}, { curve: null }), request())).toEqual({
      ok: false,
      block: { reason: 'reading-curve' },
      quote: null,
    });
  });

  it('refuses to trade while Graduation is pending', () => {
    for (const nextStep of ['graduate', 'create-pool'] as const) {
      expect(planTrade(market({}, { stage: { kind: 'graduation-pending', nextStep } }), request())).toEqual({
        ok: false,
        block: { reason: 'graduation-pending' },
        quote: null,
      });
    }
  });

  it('refuses to trade a Rescued token', () => {
    expect(planTrade(market({}, { stage: { kind: 'rescued' } }), request())).toEqual({
      ok: false,
      block: { reason: 'rescued' },
      quote: null,
    });
  });
});

/** A Pool token paired with `pair`, whose Pool the PoolKey names. */
const poolMarket = (pair: TradeMarket['pair'] = nvda): TradeMarket =>
  market(
    {},
    {
      stage: { kind: 'pool' },
      pair,
      curve: null,
      pool: poolKey({ token: TOKEN, pairToken: pair.address, poolFee: 0, tickSpacing: 200 }),
    },
  );

/** What the V4Quoter gave for 1 NVDA into TMEME's Pool on our testnet, hook fee included; every Pool buy here quotes it. */
const QUOTED_OUT = 4_694_835_680_751_173_707_804_588n;
/** QUOTED_OUT × 9900 / 10000, rounded down. */
const QUOTED_MIN_OUT = 4_647_887_323_943_661_970_726_542n;
/** The swap's deadline and any Permit2 approval's expiry: 30 minutes after planning. */
const DEADLINE = BigInt(NOW + 30 * 60);

const poolBuy = (overrides: Partial<TradeRequest> = {}): TradeRequest =>
  request({
    amount: '1',
    poolQuote: { side: 'buy', amountIn: E18, amountOut: QUOTED_OUT },
    allowances: { paired: 0n, token: 0n },
    permit2Allowances: {
      paired: { amount: 0n, expiration: 0 },
      token: { amount: 0n, expiration: 0 },
    },
    ...overrides,
  });

const POOL_KEY_TYPE = {
  type: 'tuple',
  components: [
    { name: 'currency0', type: 'address' },
    { name: 'currency1', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' },
  ],
} as const;

const currencyAndAmount = (data: Hex) => decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], data);

/** Reads back the one V4 swap a UniversalRouter `execute` carries. */
function decodeRouterSwap(transaction: TradeTransaction | undefined) {
  if (transaction?.functionName !== 'execute') throw new Error('Not a router swap');
  const [commands, inputs, deadline] = transaction.args;
  const [actions, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], inputs[0]!);
  const [swap] = decodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'poolKey', ...POOL_KEY_TYPE },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hopLimit', type: 'uint256' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    params[0]!,
  );
  return {
    commands,
    inputs: inputs.length,
    actions,
    swap,
    settleAll: currencyAndAmount(params[1]!),
    takeAll: currencyAndAmount(params[2]!),
    deadline,
    value: transaction.value,
  };
}

describe('planTrade: buying in the Pool', () => {
  it('quotes what the V4Quoter gives, hook fee included, and asks for at least 99% of it', () => {
    expect(planTrade(poolMarket(), poolBuy())).toMatchObject({
      ok: true,
      quote: { amountIn: E18, amountOut: QUOTED_OUT, minOut: QUOTED_MIN_OUT, capped: false },
    });
  });

  it('buys with ETH in one swap through the UniversalRouter, carrying the ETH as value', () => {
    const plan = planTrade(poolMarket(eth), poolBuy());
    if (!plan.ok) throw new Error(plan.block.reason);

    expect(plan.transactions).toHaveLength(1);
    expect(plan.transactions[0]).toMatchObject({ address: uniswap.universalRouter, functionName: 'execute' });
    expect(decodeRouterSwap(plan.transactions[0])).toEqual({
      // V4_SWAP, then: swap exact in single, settle all, take all.
      commands: '0x10',
      inputs: 1,
      actions: '0x060c0f',
      swap: {
        poolKey: poolKey({ token: TOKEN, pairToken: eth.address, poolFee: 0, tickSpacing: 200 }),
        // ETH is currency0, so buying swaps currency0 for currency1.
        zeroForOne: true,
        amountIn: E18,
        amountOutMinimum: QUOTED_MIN_OUT,
        hopLimit: 0n,
        hookData: '0x',
      },
      settleAll: [eth.address, E18],
      takeAll: [TOKEN, QUOTED_MIN_OUT],
      deadline: DEADLINE,
      value: E18,
    });
  });

  it('buys with NVDA by approving exactly the NVDA to Permit2, then Permit2 to the router, then swapping', () => {
    const plan = planTrade(poolMarket(), poolBuy());
    if (!plan.ok) throw new Error(plan.block.reason);

    expect(plan.transactions).toMatchObject([
      { address: nvda.address, functionName: 'approve', args: [uniswap.permit2, E18] },
      {
        address: uniswap.permit2,
        functionName: 'approve',
        args: [nvda.address, uniswap.universalRouter, E18, Number(DEADLINE)],
      },
      { address: uniswap.universalRouter, functionName: 'execute' },
    ]);
    expect(decodeRouterSwap(plan.transactions[2])).toMatchObject({
      // NVDA 0x0aE6… sorts before the token 0x2222…, so it is currency0.
      swap: { zeroForOne: true, amountIn: E18, amountOutMinimum: QUOTED_MIN_OUT },
      settleAll: [nvda.address, E18],
      takeAll: [TOKEN, QUOTED_MIN_OUT],
      value: 0n,
    });
  });

  it('swaps one for zero when the token sorts before its Paired asset', () => {
    const lowToken = '0x0000000000000000000000000000000000000aBc';
    const lowMarket: TradeMarket = {
      ...poolMarket(),
      token: { address: lowToken, symbol: 'LOW', decimals: 18 },
      pool: poolKey({ token: lowToken, pairToken: nvda.address, poolFee: 0, tickSpacing: 200 }),
    };
    const plan = planTrade(lowMarket, poolBuy());
    if (!plan.ok) throw new Error(plan.block.reason);

    expect(decodeRouterSwap(plan.transactions.at(-1))).toMatchObject({
      swap: { zeroForOne: false },
      settleAll: [nvda.address, E18],
      takeAll: [lowToken, QUOTED_MIN_OUT],
    });
  });

  it('skips the NVDA approval to Permit2 when it already covers the buy', () => {
    const plan = planTrade(poolMarket(), poolBuy({ allowances: { paired: E18, token: 0n } }));

    expect(plan.ok && plan.transactions.map((transaction) => transaction.address)).toEqual([
      uniswap.permit2,
      uniswap.universalRouter,
    ]);
  });

  it('skips the Permit2 approval when it covers the amount until the deadline', () => {
    const permit2Allowances = {
      paired: { amount: E18, expiration: Number(DEADLINE) },
      token: { amount: 0n, expiration: 0 },
    };
    const plan = planTrade(poolMarket(), poolBuy({ allowances: { paired: E18, token: 0n }, permit2Allowances }));

    expect(plan.ok && plan.transactions.map((transaction) => transaction.address)).toEqual([uniswap.universalRouter]);
  });

  it('approves through Permit2 again when its allowance is short or expires before the deadline', () => {
    for (const paired of [
      { amount: E18 - 1n, expiration: Number(DEADLINE) },
      { amount: E18, expiration: Number(DEADLINE) - 1 },
    ]) {
      const plan = planTrade(
        poolMarket(),
        poolBuy({ allowances: { paired: E18, token: 0n }, permit2Allowances: { paired, token: paired } }),
      );

      expect(plan.ok && plan.transactions.map((transaction) => transaction.address)).toEqual([
        uniswap.permit2,
        uniswap.universalRouter,
      ]);
    }
  });

  it('waits for the quote of the amount typed', () => {
    for (const poolQuote of [
      undefined,
      { side: 'buy' as const, amountIn: 2n * E18, amountOut: QUOTED_OUT },
      { side: 'sell' as const, amountIn: E18, amountOut: QUOTED_OUT },
    ]) {
      expect(planTrade(poolMarket(), poolBuy({ poolQuote }))).toEqual({
        ok: false,
        block: { reason: 'quoting' },
        quote: null,
      });
    }
  });

  it('tells a quoter that refused the amount from one that never answered', () => {
    for (const [failure, reason] of [
      ['refused', 'no-quote'],
      ['unreachable', 'quote-unavailable'],
    ] as const) {
      const poolQuote = { side: 'buy' as const, amountIn: E18, amountOut: null, failure };

      expect(planTrade(poolMarket(), poolBuy({ poolQuote }))).toEqual({ ok: false, block: { reason }, quote: null });
    }
  });

  it('refuses an amount above the NVDA balance, still showing the quote', () => {
    const plan = planTrade(poolMarket(), poolBuy({ balances: { paired: E18 - 1n, token: 0n } }));

    expect(plan).toMatchObject({
      ok: false,
      block: { reason: 'insufficient-balance', symbol: 'NVDA' },
      quote: { amountOut: QUOTED_OUT },
    });
  });

  it('asks for an amount when it is empty or zero', () => {
    for (const amount of ['', '0']) {
      expect(planTrade(poolMarket(), poolBuy({ amount }))).toMatchObject({ ok: false, block: { reason: 'no-amount' } });
    }
  });

  it('waits for the PoolKey before quoting', () => {
    expect(planTrade({ ...poolMarket(), pool: null }, poolBuy())).toEqual({
      ok: false,
      block: { reason: 'reading-pool' },
      quote: null,
    });
  });
});

/** A million TMEME, sold into TMEME's Pool. */
const SOLD = 1_000_000n * E18;
/** What the V4Quoter gave for selling SOLD into TMEME's Pool on our testnet, hook fee included. */
const SOLD_OUT = 198_789_133_247_089_263n;
/** SOLD_OUT × 9900 / 10000, rounded down. */
const SOLD_MIN_OUT = 196_801_241_914_618_370n;

const poolSell = (overrides: Partial<TradeRequest> = {}): TradeRequest =>
  poolBuy({
    side: 'sell',
    amount: '1000000',
    poolQuote: { side: 'sell', amountIn: SOLD, amountOut: SOLD_OUT },
    ...overrides,
  });

/** The contracts a plan calls, in order; `false` when it refuses. */
const addresses = (plan: ReturnType<typeof planTrade>) =>
  plan.ok && plan.transactions.map((transaction) => transaction.address);

describe('planTrade: selling in the Pool', () => {
  it('quotes what the V4Quoter gives for the tokens, hook fee included, and asks for at least 99% of it', () => {
    expect(planTrade(poolMarket(), poolSell())).toMatchObject({
      ok: true,
      quote: { amountIn: SOLD, amountOut: SOLD_OUT, minOut: SOLD_MIN_OUT, capped: false },
    });
  });

  it('approves exactly the tokens to Permit2, then Permit2 to the router, then swaps', () => {
    const plan = planTrade(poolMarket(), poolSell());
    if (!plan.ok) throw new Error(plan.block.reason);

    expect(plan.transactions).toMatchObject([
      { address: TOKEN, functionName: 'approve', args: [uniswap.permit2, SOLD] },
      {
        address: uniswap.permit2,
        functionName: 'approve',
        args: [TOKEN, uniswap.universalRouter, SOLD, Number(DEADLINE)],
      },
      { address: uniswap.universalRouter, functionName: 'execute' },
    ]);
    expect(decodeRouterSwap(plan.transactions[2])).toMatchObject({
      // The token 0x2222… sorts after NVDA 0x0aE6…, so selling it swaps currency1 for currency0.
      swap: { zeroForOne: false, amountIn: SOLD, amountOutMinimum: SOLD_MIN_OUT },
      settleAll: [TOKEN, SOLD],
      takeAll: [nvda.address, SOLD_MIN_OUT],
      deadline: DEADLINE,
      value: 0n,
    });
  });

  it('sells for ETH the same way, sending no value and taking ETH out', () => {
    const plan = planTrade(poolMarket(eth), poolSell());
    if (!plan.ok) throw new Error(plan.block.reason);

    expect(plan.transactions.map((transaction) => transaction.address)).toEqual([
      TOKEN,
      uniswap.permit2,
      uniswap.universalRouter,
    ]);
    expect(decodeRouterSwap(plan.transactions[2])).toMatchObject({
      // ETH is always currency0, so selling the token swaps one for zero.
      swap: { zeroForOne: false },
      settleAll: [TOKEN, SOLD],
      takeAll: [eth.address, SOLD_MIN_OUT],
      value: 0n,
    });
  });

  it("uses the token's allowances, not the Paired asset's, to skip approvals already sufficient", () => {
    const covered = { amount: SOLD, expiration: Number(DEADLINE) };
    const none = { amount: 0n, expiration: 0 };
    const tokenApproved = planTrade(poolMarket(), poolSell({ allowances: { paired: 0n, token: SOLD } }));
    const bothApproved = planTrade(
      poolMarket(),
      poolSell({ allowances: { paired: 0n, token: SOLD }, permit2Allowances: { paired: none, token: covered } }),
    );
    const pairedOnly = planTrade(
      poolMarket(),
      poolSell({ allowances: { paired: SOLD, token: 0n }, permit2Allowances: { paired: covered, token: none } }),
    );

    expect(addresses(tokenApproved)).toEqual([uniswap.permit2, uniswap.universalRouter]);
    expect(addresses(bothApproved)).toEqual([uniswap.universalRouter]);
    expect(addresses(pairedOnly)).toEqual([TOKEN, uniswap.permit2, uniswap.universalRouter]);
  });

  it('refuses to sell more than the token balance, still showing the quote', () => {
    const plan = planTrade(poolMarket(), poolSell({ balances: { paired: 100n * E18, token: SOLD - 1n } }));

    expect(plan).toMatchObject({
      ok: false,
      block: { reason: 'insufficient-balance', symbol: 'TMEME' },
      quote: { amountOut: SOLD_OUT },
    });
  });

  it('waits for a sell quote of the amount typed, not a buy quote', () => {
    for (const poolQuote of [
      undefined,
      { side: 'buy' as const, amountIn: SOLD, amountOut: SOLD_OUT },
      { side: 'sell' as const, amountIn: SOLD + 1n, amountOut: SOLD_OUT },
    ]) {
      expect(planTrade(poolMarket(), poolSell({ poolQuote }))).toEqual({
        ok: false,
        block: { reason: 'quoting' },
        quote: null,
      });
    }
  });

  it('refuses a sell too small to get anything back', () => {
    const plan = planTrade(
      poolMarket(),
      poolSell({ amount: '0.000000000000000001', poolQuote: { side: 'sell', amountIn: 1n, amountOut: 0n } }),
    );

    expect(plan).toMatchObject({ ok: false, block: { reason: 'too-small' } });
  });
});
