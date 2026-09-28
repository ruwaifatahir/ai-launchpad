// Reference data for the live Pons V2 deployment on Robinhood Chain mainnet
// (chainId 4663). Every value here was read off-chain, not from documentation.

/** Externals we reuse rather than fork — already deployed on chain 4663. */
export const EXTERNAL = {
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  positionManager: "0x58daec3116aae6D93017bAAea7749052E8a04fA7",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  /** Arachnid's deterministic deployer, verified present on chain 4663. */
  create2Deployer: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
} as const;

/** The live Pons instance. For reference/diffing only — we deploy our own. */
export const LIVE = {
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  memeHook: "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044",
  feeEscrow: "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e",
  buybackVault: "0x42df2a798f82289E177311362e8f5ccC45c1219c",
  locker: "0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952",
  graduationGuard: "0xf5695117b99B6f6401e67d4195BD653628176C6C",
  graduationExecutor: "0xC7819B64A1dAECD7eC19856d026cb14EfBd89046",
  launchDeployer: "0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42",
  launchForwarder: "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948",
  deployerEOA: "0xFdDE5a1E3cDF791Da71E49F817D70C7ceD72CC36",
  protocolFeeRecipient: "0x263ed295dAFaE1d9AAdD6E56c4B6F9f38eE019Dd",
} as const;

/**
 * PonsV2MemeHook.getHookPermissions() is beforeInitialize + afterSwap +
 * afterSwapReturnDelta. Uniswap V4 encodes permissions in the low 14 bits of the
 * hook address, so the hook has to be CREATE2-deployed to an address whose low
 * 14 bits are exactly this. BaseHook's constructor reverts otherwise.
 */
export const HOOK_FLAGS = {
  beforeInitialize: 1 << 13, // 0x2000
  afterSwap: 1 << 6, //        0x0040
  afterSwapReturnDelta: 1 << 2, // 0x0004
} as const;

export const HOOK_FLAG_MASK = 0x3fff; // low 14 bits
export const REQUIRED_HOOK_BITS =
  HOOK_FLAGS.beforeInitialize | HOOK_FLAGS.afterSwap | HOOK_FLAGS.afterSwapReturnDelta; // 0x2044

/** Launch config #0 as configured on the live factory. */
export const LAUNCH_CONFIG_0 = {
  supply: 1_000_000_000n * 10n ** 18n, // 1e27
  curveFeeBps: 100n, // 1%
  phantomQuote: 1_680_000_000_000_000_000n, // 1.68e18 virtual quote reserve
  graduationThreshold: 4_200_000_000_000_000_000n, // 4.2e18 real quote to graduate
  poolFee: 0, // dynamic fee is supplied by the hook
  tickSpacing: 200,
  enabled: true,
} as const;

/** Live protocol knobs, mirrored so a fresh instance behaves identically. */
export const LIVE_PARAMS = {
  launchFee: 500_000_000_000_000n, // 0.0005e18
  maxCreatorTaxBps: 1000n,
  snipeTaxStartBps: 9900n,
  snipeTaxSeconds: 3n,
  hook: {
    protocolFeeShareBps: 3000n,
    buybackBurnBps: 5000n,
    hookFeeBps: 100n,
    maxInternalPriceImpactBps: 300n,
  },
} as const;

/**
 * Native quote. The factory treats address(0) as the native pair token and does
 * not require it to be in approvedPairTokens — confirmed against live
 * TokenLaunched events, which show pairToken=0x0 launches.
 */
export const NATIVE = "0x0000000000000000000000000000000000000000";

/**
 * ERC-20 quote assets approved on the live factory, with the economics it has
 * stored for each. `phantomQuote` and `graduationThreshold` are denominated in
 * the quote asset's own decimals, not wei — USDG's 6-decimal figures are the
 * reason the decimals leg of the launch path is worth exercising.
 */
export const QUOTE_ASSETS = {
  USDG: {
    address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    decimals: 6,
    phantomQuote: 3_236_000_000n, // 3,236 USDG
    graduationThreshold: 8_090_000_000n, // 8,090 USDG
    /** EOA holders, for hardhat_impersonateAccount on a fork. */
    whales: [
      "0x4B431ec432CC11ebd4E460D8eC12057F07b2FFf6",
      "0x2d4d2A025b10C09BDbd794B4FCe4F7ea8C7d7bB4",
    ],
  },
  NVDA: {
    address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    decimals: 18,
    phantomQuote: 16_640_000_000_000_000_000n,
    graduationThreshold: 41_600_000_000_000_000_000n,
    whales: [],
  },
  MSTR: {
    address: "0xec262a75e413fAfD0dF80480274532C79D42da09",
    decimals: 18,
    phantomQuote: 31_992_090_954_028_668_648n,
    graduationThreshold: 79_980_227_385_071_671_620n,
    whales: [],
  },
  SPY: {
    address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
    decimals: 18,
    phantomQuote: 4_360_000_000_000_000_000n,
    graduationThreshold: 10_900_000_000_000_000_000n,
    whales: [],
  },
  IBM: {
    address: "0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619",
    decimals: 18,
    phantomQuote: 17_556_446_144_040_790_335n,
    graduationThreshold: 43_891_115_360_101_975_839n,
    whales: [],
  },
  SLV: {
    address: "0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f",
    decimals: 18,
    phantomQuote: 69_118_594_847_775_177_265n,
    graduationThreshold: 172_796_487_119_437_943_163n,
    whales: [],
  },
} as const;

/**
 * Uniswap V4 periphery that is live on chain 4663 and wired to the same
 * PoolManager the Pons hook uses. StateView is a read-only lens — handy for
 * confirming pool state independently of anything we deployed.
 *
 * Three UniversalRouters share that PoolManager and real swap traffic arrives
 * through assorted aggregators, so none of them is "the" router. The scenarios
 * swap through contracts/test/PonsV2TestSwapRouter.sol instead; these are here
 * for cross-checking against production paths.
 */
export const V4_PERIPHERY = {
  stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
  universalRouters: [
    "0x269F10Ab1a7CE6c163B176D951eBd145A944A39D",
    "0x8876789976dEcBfCbBbe364623C63652db8C0904",
    "0x06AfBA43Fd06227fA663b0DAecF536f6EaA6bf99",
  ],
} as const;

/** Fee policy defaults the hook ships with, for reconciling fee splits. */
export const BASIS_POINTS = 10_000n;
