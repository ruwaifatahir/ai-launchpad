// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockStockToken
 * @notice TEST-ONLY. Stand-in for a Robinhood stock token (NVDA, SPY, ...) on
 * testnet, where the real ones do not exist. Anyone can mint, so launches
 * priced in it can be driven all the way to graduation for free.
 */
contract MockStockToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
