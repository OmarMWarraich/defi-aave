// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IWrappedTokenGatewayV3 (Aave v3)
/// @notice Minimal gateway interface for supplying/withdrawing native ETH as WETH.
/// @dev Replaces the v2 `IWETHGateway`. To withdraw, the caller must first
///      approve the gateway to pull its aWETH (the gateway burns aWETH for WETH,
///      unwraps to ETH, and forwards it to `to`).
interface IWrappedTokenGatewayV3 {
    /// @notice Wraps the sent ETH and supplies it to the pool on behalf of `onBehalfOf`.
    function depositETH(
        address pool,
        address onBehalfOf,
        uint16 referralCode
    ) external payable;

    /// @notice Withdraws `amount` of supplied ETH and sends it to `to`.
    function withdrawETH(
        address pool,
        uint256 amount,
        address to
    ) external;
}
