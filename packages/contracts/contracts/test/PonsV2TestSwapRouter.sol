// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PonsV2TestSwapRouter
 * @notice TEST-ONLY. Not part of the Pons protocol and never deployed to a real
 * network — it exists so the fork scenarios can swap a graduated pool without
 * hand-encoding UniversalRouter commands and a Permit2 approval dance.
 *
 * Minimal V4 router: unlock the PoolManager, swap, then settle the negative leg
 * and take the positive one. Handles native and ERC-20 currencies. Deliberately
 * has no slippage protection beyond the caller's `minAmountOut` and no deadline
 * — a fork scenario is the only caller.
 */
contract PonsV2TestSwapRouter is IUnlockCallback {
    using CurrencyLibrary for Currency;
    using SafeERC20 for IERC20;

    error NotPoolManager();
    error InsufficientOutput(uint256 actual, uint256 expected);

    IPoolManager public immutable poolManager;

    struct CallbackData {
        address payer;
        address recipient;
        PoolKey key;
        SwapParams params;
    }

    constructor(IPoolManager poolManager_) {
        poolManager = poolManager_;
    }

    receive() external payable {}

    /**
     * @notice Exact-input swap. Pull `amountIn` of the input currency from the
     * caller (or msg.value for native) and send the output to `recipient`.
     * @param zeroForOne True to swap currency0 for currency1.
     */
    function swapExactIn(
        PoolKey calldata key,
        bool zeroForOne,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external payable returns (uint256 amountOut) {
        SwapParams memory params = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(amountIn),
            // No price limit: the scenarios want the swap to fill, and the
            // caller's minAmountOut is the bound that matters.
            sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        });

        bytes memory result = poolManager.unlock(
            abi.encode(CallbackData({payer: msg.sender, recipient: recipient, key: key, params: params}))
        );
        amountOut = abi.decode(result, (uint256));
        if (amountOut < minAmountOut) revert InsufficientOutput(amountOut, minAmountOut);

        // Refund any native change the pool did not consume.
        uint256 leftover = address(this).balance;
        if (leftover != 0) {
            (bool ok,) = msg.sender.call{value: leftover}("");
            require(ok, "refund failed");
        }
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        CallbackData memory data = abi.decode(rawData, (CallbackData));

        BalanceDelta delta = poolManager.swap(data.key, data.params, "");

        (Currency inputCurrency, Currency outputCurrency) = data.params.zeroForOne
            ? (data.key.currency0, data.key.currency1)
            : (data.key.currency1, data.key.currency0);
        (int128 inputDelta, int128 outputDelta) =
            data.params.zeroForOne ? (delta.amount0(), delta.amount1()) : (delta.amount1(), delta.amount0());

        // Negative delta is what we owe the pool.
        uint256 owed = inputDelta < 0 ? uint256(uint128(-inputDelta)) : 0;
        if (owed != 0) {
            poolManager.sync(inputCurrency);
            if (inputCurrency.isAddressZero()) {
                poolManager.settle{value: owed}();
            } else {
                IERC20(Currency.unwrap(inputCurrency)).safeTransferFrom(data.payer, address(poolManager), owed);
                poolManager.settle();
            }
        }

        uint256 received = outputDelta > 0 ? uint256(uint128(outputDelta)) : 0;
        if (received != 0) {
            poolManager.take(outputCurrency, data.recipient, received);
        }

        return abi.encode(received);
    }
}
