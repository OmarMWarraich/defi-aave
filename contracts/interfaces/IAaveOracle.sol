// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IAaveOracle (Aave v3)
/// @notice Minimal price-oracle interface. Replaces the v2 `IPriceOracle`.
/// @dev In v3 prices are denominated in the base currency (USD) with
///      `BASE_CURRENCY_UNIT` decimals (1e8), not in ETH as in v2.
interface IAaveOracle {
    /// @notice Returns the price of `asset` in the base currency (USD, 8 decimals).
    function getAssetPrice(address asset) external view returns (uint256);

    /// @notice The unit of the base currency (1e8 for USD-denominated oracles).
    function BASE_CURRENCY_UNIT() external view returns (uint256);
}
