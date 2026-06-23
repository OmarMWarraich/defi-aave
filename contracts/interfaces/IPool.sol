// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPool (Aave v3)
/// @notice Minimal subset of the Aave v3 Pool used by this integration.
/// @dev Replaces the v2 `ILendingPool`. Key differences from v2:
///      - `deposit` is renamed `supply`.
///      - `getUserAccountData` amounts are denominated in the oracle BASE
///        currency (USD, 8 decimals) — NOT ETH as in v2.
interface IPool {
    /// @notice Supplies an `amount` of `asset` into the reserve, minting aTokens to `onBehalfOf`.
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /// @notice Withdraws `amount` of the underlying `asset`, burning the aTokens owned.
    /// @return The final amount withdrawn.
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);

    /// @notice Borrows `amount` of `asset`, provided the borrower has sufficient collateral.
    /// @param interestRateMode 2 for variable (stable-rate borrowing is disabled in v3).
    function borrow(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        uint16 referralCode,
        address onBehalfOf
    ) external;

    /// @notice Repays a borrowed `amount` of `asset` on behalf of `onBehalfOf`.
    /// @return The final amount repaid.
    function repay(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        address onBehalfOf
    ) external returns (uint256);

    /// @notice Returns the aggregated account data across all reserves.
    /// @dev All *Base values are in the oracle base currency (USD, 8 decimals).
    function getUserAccountData(
        address user
    )
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
}
