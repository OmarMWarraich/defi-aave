// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IPoolAddressesProvider} from "./interfaces/IPoolAddressesProvider.sol";
import {IPool} from "./interfaces/IPool.sol";
import {IAaveOracle} from "./interfaces/IAaveOracle.sol";
import {IWrappedTokenGatewayV3} from "./interfaces/IWrappedTokenGatewayV3.sol";

/// @title AaveDeFi
/// @notice Deposit ETH as collateral into Aave v3 and borrow DAI against it,
///         then repay the DAI and withdraw the ETH collateral.
/// @dev Modernized from the original Aave v2 single-function demo:
///      - Aave v3 interfaces (Pool/Oracle/WrappedTokenGatewayV3).
///      - Protocol addresses are injected via the constructor (not hardcoded),
///        so the contract is deployable to any network and testable on a fork.
///      - SafeERC20, ReentrancyGuard, Ownable, custom errors, and on-chain
///        validation of the requested borrow against Aave's available capacity.
///
///      LIMITATION (by design, carried over from the original): all users share
///      a SINGLE Aave position (this contract's address). Per-user balances are
///      tracked off the protocol in `totalETHDeposits` / `totalDAIBorrows`.
///      Aave's own health-factor checks keep the shared position solvent, but
///      this contract does not enforce fairness between users. Do not use as-is
///      with mutually untrusted users; a per-user vault design is future work.
contract AaveDeFi is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /// @dev Aave referral program is inactive; 0 is the standard value.
    uint16 private constant REFERRAL_CODE = 0;
    /// @dev Aave v3 variable interest-rate mode (stable mode is disabled).
    uint256 private constant VARIABLE_RATE = 2;
    /// @dev Basis-point denominator (100% = 10_000).
    uint256 private constant BPS = 10_000;

    string public constant name = "MY Aave DeFi";

    // --- Injected protocol references (immutable) ---
    IPoolAddressesProvider public immutable provider;
    IPool public immutable pool;
    IAaveOracle public immutable oracle;
    IWrappedTokenGatewayV3 public immutable wethGateway;
    IERC20 public immutable dai;
    IERC20 public immutable aWeth;
    uint8 public immutable daiDecimals;

    // --- Off-protocol per-user accounting ---
    mapping(address => uint256) public totalETHDeposits;
    mapping(address => uint256) public totalDAIBorrows;

    /// @notice Fraction (in basis points) of Aave's available borrow capacity
    ///         this contract will allow, as a liquidation safety buffer.
    /// @dev Aave's `availableBorrowsBase` already reflects the collateral's LTV.
    ///      Borrowing the full amount would put the position at the edge of its
    ///      borrowing power, so a small price move could trigger liquidation.
    ///      `safetyFactorBps` borrows only a fraction of that headroom — e.g.
    ///      `6000` (60%) is the project default, matching the original demo's
    ///      0.6 safety factor. Tunable by the owner via `setSafetyFactor`.
    uint256 public safetyFactorBps;

    event DepositBorrow(
        address indexed user,
        uint256 ethDeposited,
        uint256 totalETHDeposits,
        uint256 daiPrice,
        uint256 daiBorrowed,
        uint256 totalDAIBorrows
    );
    event Repay(
        address indexed user,
        uint256 daiRepaid,
        uint256 totalDAIBorrows
    );
    event Withdraw(
        address indexed user,
        uint256 ethWithdrawn,
        uint256 totalETHDeposits
    );
    event SafetyFactorUpdated(uint256 oldBps, uint256 newBps);

    error ZeroAmount();
    error InvalidSafetyFactor();
    error OraclePriceZero();
    error BorrowExceedsSafeMax(uint256 requested, uint256 safeMax);
    error InsufficientDeposit(uint256 requested, uint256 available);

    /// @param _provider  Aave v3 PoolAddressesProvider.
    /// @param _wethGateway Aave v3 WrappedTokenGatewayV3 (WETH gateway).
    /// @param _dai        DAI token address.
    /// @param _aWeth      Aave v3 aWETH token address (collateral receipt).
    /// @param _safetyFactorBps Initial safety factor in bps (<= 10_000).
    constructor(
        IPoolAddressesProvider _provider,
        IWrappedTokenGatewayV3 _wethGateway,
        address _dai,
        address _aWeth,
        uint256 _safetyFactorBps
    ) Ownable(msg.sender) {
        if (_safetyFactorBps > BPS) revert InvalidSafetyFactor();

        provider = _provider;
        pool = IPool(_provider.getPool());
        oracle = IAaveOracle(_provider.getPriceOracle());
        wethGateway = _wethGateway;
        dai = IERC20(_dai);
        aWeth = IERC20(_aWeth);
        daiDecimals = IERC20Metadata(_dai).decimals();
        safetyFactorBps = _safetyFactorBps;
    }

    /// @notice Accepts ETH (e.g. gateway refunds). User flows route ETH directly.
    receive() external payable {}

    /// @notice Deposit the sent ETH as collateral and borrow `requestedDAI` against it.
    /// @dev The requested amount is validated on-chain against Aave's available
    ///      borrow capacity scaled by `safetyFactorBps` — the browser no longer
    ///      dictates an unchecked borrow amount.
    /// @param requestedDAI Amount of DAI to borrow (may be 0 to only deposit).
    function depositETHAndBorrowDAI(
        uint256 requestedDAI
    ) external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        totalETHDeposits[msg.sender] += msg.value;
        wethGateway.depositETH{value: msg.value}(
            address(pool),
            address(this),
            REFERRAL_CODE
        );

        uint256 daiPrice = oracle.getAssetPrice(address(dai));
        if (daiPrice == 0) revert OraclePriceZero();

        if (requestedDAI > 0) {
            uint256 safeMax = _maxSafeBorrowDAI(daiPrice);
            if (requestedDAI > safeMax)
                revert BorrowExceedsSafeMax(requestedDAI, safeMax);

            pool.borrow(
                address(dai),
                requestedDAI,
                VARIABLE_RATE,
                REFERRAL_CODE,
                address(this)
            );
            totalDAIBorrows[msg.sender] += requestedDAI;
            dai.safeTransfer(msg.sender, requestedDAI);
        }

        emit DepositBorrow(
            msg.sender,
            msg.value,
            totalETHDeposits[msg.sender],
            daiPrice,
            requestedDAI,
            totalDAIBorrows[msg.sender]
        );
    }

    /// @notice Repay `amount` of borrowed DAI on behalf of the shared position.
    /// @dev Pulls DAI from the caller, repays Aave, and refunds any unused DAI.
    /// @param amount DAI amount the caller wishes to repay.
    function repayDAI(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        dai.safeTransferFrom(msg.sender, address(this), amount);
        dai.forceApprove(address(pool), amount);
        uint256 repaid = pool.repay(
            address(dai),
            amount,
            VARIABLE_RATE,
            address(this)
        );

        // Reduce caller's tracked debt, never underflowing past zero.
        uint256 tracked = totalDAIBorrows[msg.sender];
        totalDAIBorrows[msg.sender] = repaid >= tracked ? 0 : tracked - repaid;

        // Refund any DAI not consumed by the repay (e.g. debt < amount).
        if (repaid < amount) {
            dai.safeTransfer(msg.sender, amount - repaid);
        }

        emit Repay(msg.sender, repaid, totalDAIBorrows[msg.sender]);
    }

    /// @notice Withdraw `amount` of ETH collateral back to the caller.
    /// @dev Approves the gateway to pull aWETH, then unwraps to ETH for the caller.
    ///      Aave reverts if the withdrawal would leave the shared position unhealthy.
    /// @param amount ETH amount (wei) to withdraw.
    function withdrawETH(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 deposited = totalETHDeposits[msg.sender];
        if (amount > deposited) revert InsufficientDeposit(amount, deposited);

        totalETHDeposits[msg.sender] = deposited - amount;
        aWeth.forceApprove(address(wethGateway), amount);
        wethGateway.withdrawETH(address(pool), amount, msg.sender);

        emit Withdraw(msg.sender, amount, totalETHDeposits[msg.sender]);
    }

    /// @notice Update the borrow safety factor (owner only).
    /// @param newBps New safety factor in bps (<= 10_000).
    function setSafetyFactor(uint256 newBps) external onlyOwner {
        if (newBps > BPS) revert InvalidSafetyFactor();
        emit SafetyFactorUpdated(safetyFactorBps, newBps);
        safetyFactorBps = newBps;
    }

    /// @notice Rescue ERC20 tokens accidentally sent to this contract (owner only).
    function rescueERC20(
        IERC20 token,
        address to,
        uint256 amount
    ) external onlyOwner {
        token.safeTransfer(to, amount);
    }

    /// @notice Current DAI price from the Aave oracle (USD, 8 decimals).
    function daiPriceUSD() external view returns (uint256) {
        return oracle.getAssetPrice(address(dai));
    }

    /// @notice Maximum DAI the shared position can safely borrow right now.
    function maxSafeBorrowDAI() external view returns (uint256) {
        uint256 daiPrice = oracle.getAssetPrice(address(dai));
        if (daiPrice == 0) revert OraclePriceZero();
        return _maxSafeBorrowDAI(daiPrice);
    }

    /// @dev Converts Aave's available borrow capacity into DAI units and applies
    ///      the safety factor. Borrow math (all amounts integer / wei):
    ///
    ///        availableBorrowsBase : spare borrowing power, USD with 1e8 precision
    ///        daiPrice             : DAI price, USD with 1e8 precision (~1e8)
    ///        10**daiDecimals      : DAI's own unit (1e18)
    ///
    ///        maxDai = availableBorrowsBase * 10**daiDecimals / daiPrice
    ///
    ///      The 1e8 base unit cancels between numerator and `daiPrice`, leaving a
    ///      DAI amount in its native decimals. We then scale by `safetyFactorBps`
    ///      (out of `BPS` = 10_000) to leave a liquidation buffer. This is the
    ///      on-chain replacement for the old browser-side floating-point estimate.
    function _maxSafeBorrowDAI(
        uint256 daiPrice
    ) internal view returns (uint256) {
        (, , uint256 availableBorrowsBase, , , ) = pool.getUserAccountData(
            address(this)
        );
        uint256 maxDai = (availableBorrowsBase * (10 ** daiDecimals)) /
            daiPrice;
        return (maxDai * safetyFactorBps) / BPS;
    }
}
