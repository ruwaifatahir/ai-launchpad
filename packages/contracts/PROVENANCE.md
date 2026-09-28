# Provenance

Every Solidity file in this repository was pulled verbatim from verified source
on Robinhood Chain mainnet (chainId 4663) via Blockscout
`/api/v2/smart-contracts/{address}`. Nothing was hand-written, patched or
reformatted. `npm run parity` re-checks the build against the live chain.

## Source addresses

| Contract | Address | Additional sources |
| --- | --- | --- |
| PonsV2LaunchFactory | 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e | 86 |
| PonsV2MemeHook | 0xe5e702641ea86f4ae6cc3cdaed2b886f976be044 | 45 |
| PonsV2FeeEscrow | 0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e | 11 |
| PonsV2BuybackVault | 0x42df2a798f82289e177311362e8f5ccc45c1219c | 14 |
| PonsV2LaunchLocker | 0x267444d099b10fb5ed7c3cc7b7c767adca574952 | 13 |
| PonsV2GraduationExecutor | 0xc7819b64a1daecd7ec19856d026cb14efbd89046 | 48 |
| _launchDeployer_ | 0x3711cea4feade896c913c68f01eda97cb06d1a42 | Blockscout returns HTTP 500; its source arrives inside another tree |
| PonsV2LaunchAndBuy | 0xe33e9e479df8802cb0866d5d05258bec4cf62948 | 87 |

## Compiler (copied from the factory’s verified metadata)

- solc `v0.8.35+commit.47b9dedd`
- `viaIR: true`, optimizer enabled, `runs: 200`
- `evmVersion: cancun`
- `metadata.bytecodeHash: ipfs`, `appendCBOR: true`

The 18 remappings in `remappings.txt` are the factory’s verified
`CompilerSettings.remappings`, unchanged, so no import line needed editing.

## Files (89)

### First-party (15)

- `contracts/src/v2/PonsV2BondingCurve.sol`
- `contracts/src/v2/PonsV2BuybackVault.sol`
- `contracts/src/v2/PonsV2FeeEscrow.sol`
- `contracts/src/v2/PonsV2GraduationExecutor.sol`
- `contracts/src/v2/PonsV2GraduationGuard.sol`
- `contracts/src/v2/PonsV2LaunchAndBuy.sol`
- `contracts/src/v2/PonsV2LaunchDeployer.sol`
- `contracts/src/v2/PonsV2LaunchFactory.sol`
- `contracts/src/v2/PonsV2LaunchLocker.sol`
- `contracts/src/v2/PonsV2LauncherToken.sol`
- `contracts/src/v2/hooks/PonsV2MemeHook.sol`
- `contracts/src/v2/interfaces/ILaunchpadV2.sol`
- `contracts/src/v2/interfaces/ILaunchpadV2Graduation.sol`
- `contracts/src/v2/libraries/PonsV2BondingCurveMath.sol`
- `contracts/src/v2/libraries/PonsV2GraduationMath.sol`

### Vendored dependencies (74)

- `contracts/lib/openzeppelin-contracts/contracts/access/Ownable.sol`
- `contracts/lib/openzeppelin-contracts/contracts/access/Ownable2Step.sol`
- `contracts/lib/openzeppelin-contracts/contracts/interfaces/IERC1363.sol`
- `contracts/lib/openzeppelin-contracts/contracts/interfaces/IERC165.sol`
- `contracts/lib/openzeppelin-contracts/contracts/interfaces/IERC20.sol`
- `contracts/lib/openzeppelin-contracts/contracts/interfaces/IERC20Metadata.sol`
- `contracts/lib/openzeppelin-contracts/contracts/interfaces/draft-IERC6093.sol`
- `contracts/lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol`
- `contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol`
- `contracts/lib/openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Burnable.sol`
- `contracts/lib/openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Metadata.sol`
- `contracts/lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol`
- `contracts/lib/openzeppelin-contracts/contracts/token/ERC721/IERC721.sol`
- `contracts/lib/openzeppelin-contracts/contracts/utils/Context.sol`
- `contracts/lib/openzeppelin-contracts/contracts/utils/Create2.sol`
- `contracts/lib/openzeppelin-contracts/contracts/utils/Errors.sol`
- `contracts/lib/openzeppelin-contracts/contracts/utils/LowLevelCall.sol`
- `contracts/lib/openzeppelin-contracts/contracts/utils/Panic.sol`
- `contracts/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol`
- `contracts/lib/openzeppelin-contracts/contracts/utils/StorageSlot.sol`
- `contracts/lib/openzeppelin-contracts/contracts/utils/introspection/IERC165.sol`
- `contracts/lib/openzeppelin-contracts/contracts/utils/math/Math.sol`
- `contracts/lib/openzeppelin-contracts/contracts/utils/math/SafeCast.sol`
- `contracts/lib/v4-core/src/interfaces/IExtsload.sol`
- `contracts/lib/v4-core/src/interfaces/IExttload.sol`
- `contracts/lib/v4-core/src/interfaces/IHooks.sol`
- `contracts/lib/v4-core/src/interfaces/IPoolManager.sol`
- `contracts/lib/v4-core/src/interfaces/IProtocolFees.sol`
- `contracts/lib/v4-core/src/interfaces/callback/IUnlockCallback.sol`
- `contracts/lib/v4-core/src/interfaces/external/IERC20Minimal.sol`
- `contracts/lib/v4-core/src/interfaces/external/IERC6909Claims.sol`
- `contracts/lib/v4-core/src/libraries/BitMath.sol`
- `contracts/lib/v4-core/src/libraries/CustomRevert.sol`
- `contracts/lib/v4-core/src/libraries/FixedPoint128.sol`
- `contracts/lib/v4-core/src/libraries/FixedPoint96.sol`
- `contracts/lib/v4-core/src/libraries/FullMath.sol`
- `contracts/lib/v4-core/src/libraries/Hooks.sol`
- `contracts/lib/v4-core/src/libraries/LPFeeLibrary.sol`
- `contracts/lib/v4-core/src/libraries/LiquidityMath.sol`
- `contracts/lib/v4-core/src/libraries/ParseBytes.sol`
- `contracts/lib/v4-core/src/libraries/Pool.sol`
- `contracts/lib/v4-core/src/libraries/Position.sol`
- `contracts/lib/v4-core/src/libraries/ProtocolFeeLibrary.sol`
- `contracts/lib/v4-core/src/libraries/SafeCast.sol`
- `contracts/lib/v4-core/src/libraries/SqrtPriceMath.sol`
- `contracts/lib/v4-core/src/libraries/StateLibrary.sol`
- `contracts/lib/v4-core/src/libraries/SwapMath.sol`
- `contracts/lib/v4-core/src/libraries/TickBitmap.sol`
- `contracts/lib/v4-core/src/libraries/TickMath.sol`
- `contracts/lib/v4-core/src/libraries/UnsafeMath.sol`
- `contracts/lib/v4-core/src/types/BalanceDelta.sol`
- `contracts/lib/v4-core/src/types/BeforeSwapDelta.sol`
- `contracts/lib/v4-core/src/types/Currency.sol`
- `contracts/lib/v4-core/src/types/PoolId.sol`
- `contracts/lib/v4-core/src/types/PoolKey.sol`
- `contracts/lib/v4-core/src/types/PoolOperation.sol`
- `contracts/lib/v4-core/src/types/Slot0.sol`
- `contracts/lib/v4-hooks-public/src/base/BaseHook.sol`
- `contracts/lib/v4-periphery/lib/permit2/src/interfaces/IAllowanceTransfer.sol`
- `contracts/lib/v4-periphery/lib/permit2/src/interfaces/IEIP712.sol`
- `contracts/lib/v4-periphery/src/base/ImmutableState.sol`
- `contracts/lib/v4-periphery/src/interfaces/IEIP712_v4.sol`
- `contracts/lib/v4-periphery/src/interfaces/IERC721Permit_v4.sol`
- `contracts/lib/v4-periphery/src/interfaces/IImmutableState.sol`
- `contracts/lib/v4-periphery/src/interfaces/IMulticall_v4.sol`
- `contracts/lib/v4-periphery/src/interfaces/INotifier.sol`
- `contracts/lib/v4-periphery/src/interfaces/IPermit2Forwarder.sol`
- `contracts/lib/v4-periphery/src/interfaces/IPoolInitializer_v4.sol`
- `contracts/lib/v4-periphery/src/interfaces/IPositionManager.sol`
- `contracts/lib/v4-periphery/src/interfaces/ISubscriber.sol`
- `contracts/lib/v4-periphery/src/interfaces/IUnorderedNonce.sol`
- `contracts/lib/v4-periphery/src/libraries/Actions.sol`
- `contracts/lib/v4-periphery/src/libraries/LiquidityAmounts.sol`
- `contracts/lib/v4-periphery/src/libraries/PositionInfoLibrary.sol`
