// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPoolAddressesProvider (Aave v3)
/// @notice Minimal registry interface for resolving core Aave v3 addresses.
/// @dev Replaces the v2 `ILendingPoolAddressesProvider`.
interface IPoolAddressesProvider {
    /// @notice Returns the address of the Aave v3 Pool (was `getLendingPool` in v2).
    function getPool() external view returns (address);

    /// @notice Returns the address of the Aave v3 price oracle.
    function getPriceOracle() external view returns (address);
}
