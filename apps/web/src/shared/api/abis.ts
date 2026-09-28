import { erc20Abi, parseAbi } from 'viem';

/*
 * The slices of the Pons V2 launchpad ABIs the app calls, taken from the contracts' build artifacts.
 * Human-readable so a signature change shows up in review.
 */

const TOKEN_PARAMS =
  '(string name, string symbol, string logo, string description, (string twitter, string telegram, string discord, string website, string farcaster) socials, address creatorFeeRecipient, uint16 creatorTaxBps, bool buybackEnabled, bytes32 expectedEconomics, bytes32 salt)';

export const launchFactoryAbi = parseAbi([
  'function launchFee() view returns (uint256)',
  'function maxCreatorTaxBps() view returns (uint256)',
  'function snipeTaxStartBps() view returns (uint256)',
  'function snipeTaxSeconds() view returns (uint256)',
  'function getLaunchConfig(uint256 id) view returns ((uint256 supply, uint256 curveFeeBps, uint256 phantomQuote, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, bool enabled))',
  'function pairTokenEconomics(address pairToken) view returns (uint256 phantomQuote, uint256 graduationThreshold, uint8 decimals)',
  'function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)',
  `function launchToken(${TOKEN_PARAMS} params, uint256 launchConfigId, address pairToken, address[] snipeTaxExemptions) payable returns (address token, address curve)`,
  'event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)',
  // `phase` is the GraduationPhase enum: NotGraduated, Swept, PoolCreated, Rescued.
  'function getLaunchedToken(address token) view returns ((address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, bool buybackEnabled, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists))',
  // Graduation, both permissionless: sweep a sold-out curve, then open the swept launch's Pool.
  'function graduate(address token)',
  'function createGraduatedPool(address token)',
]);

export const launchAndBuyAbi = parseAbi([
  `function launchAndBuy(${TOKEN_PARAMS} params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] snipeTaxExemptions) payable returns (address token, address curve, uint256 tokensOut)`,
]);

/** A launched token: ERC-20 plus the metadata set at Launch. */
export const launchedTokenAbi = [
  ...erc20Abi,
  ...parseAbi([
    'function logo() view returns (string)',
    'function description() view returns (string)',
    'function socials() view returns (string twitter, string telegram, string discord, string website, string farcaster)',
  ]),
];

export const bondingCurveAbi = parseAbi([
  // True once the curve is sold out, until it is swept.
  'function readyToGraduate() view returns (bool)',
  // Phantom reserve included, pending fees excluded: the reserves the curve prices against.
  'function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)',
  // The Paired asset actually raised, and what the curve must raise to sell out.
  'function realQuoteReserve() view returns (uint256)',
  'function graduationThreshold() view returns (uint256)',
  // Tokens still for sale before the curve sells out; a larger buy is capped here and refunded.
  'function sellableTokens() view returns (uint256)',
  // The curve fee and Creator tax, in basis points of every trade.
  'function feeBps() view returns (uint256)',
  'function creatorTaxBps() view returns (uint256)',
  // The Snipe tax `buyer` would pay right now, before the curve caps it; zero once it has decayed.
  'function currentSnipeTaxBps(address buyer) view returns (uint256)',
  'function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)',
  // Pulls `tokensIn` from the seller, so it needs that much allowance first.
  'function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)',
]);

/**
 * The fee escrow: one balance per wallet and asset, summed over every launch that pays that
 * wallet. `claim` and `claimToken` are overloaded with an amount; only the claim-all forms are here.
 */
export const feeEscrowAbi = parseAbi([
  'function balanceOf(address recipient) view returns (uint256)',
  'function balanceOfToken(address recipient, address token) view returns (uint256)',
  // Both pay the caller its whole balance, and revert with NoBalance when there is none.
  'function claim() returns (uint256 amount)',
  'function claimToken(address token) returns (uint256 amount)',
]);

/** ERC-20 plus the public `mint` of a mintable test token (a Paired asset with `mintable` set). */
export const mockStockTokenAbi = [...erc20Abi, ...parseAbi(['function mint(address to, uint256 amount)'])];

/*
 * Uniswap v4, for trading in the Pool. A Pool is named by its PoolKey; its id is the key's
 * `keccak256(abi.encode(key))`.
 */
const POOL_KEY = '(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)';

export const v4QuoterAbi = parseAbi([
  // Not a view: it runs the swap and reverts with the result, so it is only ever simulated.
  `function quoteExactInputSingle((${POOL_KEY} poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)`,
]);

export const stateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
]);

export const universalRouterAbi = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
]);

export const permit2Abi = parseAbi([
  // Lets `spender` pull `amount` of `token` from the caller until `expiration`.
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
]);
