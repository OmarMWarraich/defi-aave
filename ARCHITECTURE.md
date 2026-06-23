# Architecture

How the pieces fit together: a React frontend talks to the `AaveDeFi` contract, which
in turn integrates with the Aave v3 protocol on the same chain.

## Component overview

```
┌──────────────────────────────┐         ┌───────────────────────────────┐
│  Frontend (Vite + React 18)  │         │      AaveDeFi.sol (ours)      │
│                              │         │                               │
│  wagmi + viem  ──────────────┼── RPC ──▶  depositETHAndBorrowDAI       │
│  RainbowKit (wallet connect) │         │  repayDAI                     │
│  TanStack Query (cache)      │◀── reads─┤  withdrawETH                  │
│  typed `as const` ABI        │         │  maxSafeBorrowDAI / daiPriceUSD│
└──────────────────────────────┘         └───────────────┬───────────────┘
                                                          │ (injected addresses)
                                       ┌──────────────────┼─────────────────────┐
                                       ▼                  ▼                     ▼
                              IWrappedTokenGatewayV3   IPool              IAaveOracle
                              (ETH ⇄ WETH/aWETH)   (supply/borrow/      (DAI price,
                                                    repay/withdraw)      USD 8-dec)
                                                          │
                                              IPoolAddressesProvider
                                              (getPool / getPriceOracle)
```

The contract holds a **single shared Aave position** at its own address. It records
per-user `totalETHDeposits` / `totalDAIBorrows` off-protocol; Aave only ever sees one
account. See the limitation note below.

## Contracts

- **`AaveDeFi.sol`** — the integration contract. `Ownable` + `ReentrancyGuard`, uses
  `SafeERC20`, custom errors, and validates borrows on-chain.
- **`contracts/interfaces/`** — slim local Aave v3 interfaces (`IPool`,
  `IPoolAddressesProvider`, `IAaveOracle`, `IWrappedTokenGatewayV3`) instead of the full
  `@aave/*` packages, to keep a clean single-compiler (0.8.24) build.

Protocol addresses (PoolAddressesProvider, WETH gateway, DAI, aWETH) are **injected via
the constructor** and configured per-network in `scripts/deploy.ts`. The Pool and Oracle
are resolved from the provider at construction.

## Lifecycle

| Action           | Function                                         | Flow                                                                                                                     |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Deposit + borrow | `depositETHAndBorrowDAI(requestedDAI)` (payable) | gateway wraps ETH → aWETH to the contract; validate `requestedDAI` ≤ safe max; `pool.borrow` DAI; transfer DAI to caller |
| Repay            | `repayDAI(amount)`                               | pull DAI from caller, `forceApprove` pool, `pool.repay`, refund any unused DAI                                           |
| Withdraw         | `withdrawETH(amount)`                            | approve aWETH to gateway, `gateway.withdrawETH` unwraps to caller                                                        |
| Admin            | `setSafetyFactor`, `rescueERC20`                 | owner-only                                                                                                               |

Each state-changing function is `nonReentrant` and emits an event (`DepositBorrow`,
`Repay`, `Withdraw`, `SafetyFactorUpdated`).

## Borrow math (on-chain)

The safe borrow cap is computed in `_maxSafeBorrowDAI`, not in the browser:

```
availableBorrowsBase  = pool.getUserAccountData(this).availableBorrowsBase  // USD, 1e8
daiPrice              = oracle.getAssetPrice(DAI)                           // USD, 1e8
maxDai                = availableBorrowsBase * 10**daiDecimals / daiPrice    // DAI native units
safeMax               = maxDai * safetyFactorBps / 10_000
```

- **Units:** the `1e8` USD base unit cancels between `availableBorrowsBase` and
  `daiPrice`, leaving a DAI amount in its own decimals (18). In Aave v3, oracle prices
  and account data are USD-denominated (8 decimals) — unlike v2, which was ETH-denominated.
- **Safety factor:** `availableBorrowsBase` already reflects the collateral's LTV, so
  borrowing 100% of it would sit at the edge of liquidation. `safetyFactorBps` (default
  `6000` = 60%) borrows only part of that headroom as a buffer. Owner-tunable.
- A `depositETHAndBorrowDAI` call that requests more than `safeMax` reverts with
  `BorrowExceedsSafeMax(requested, safeMax)`.

## Frontend

- **wagmi + viem** for reads (`useReadContract`, `useBalance`) and writes
  (`useWriteContract` + `useWaitForTransactionReceipt`).
- **RainbowKit** for wallet connection (EIP-1193/6963 multi-wallet), replacing the old
  `window.ethereum.enable()` wiring.
- **Typed `as const` ABI** (`src/contracts/aaveDeFi.ts`) gives viem full type inference;
  addresses come from env (`src/contracts/addresses.ts`).
- Amounts use viem `parseEther`/`parseUnits` + `formatUnits`/`formatEther` (no float math).

## Testing & CI

- **`test/AaveDeFi.test.ts`** runs against a pinned Hardhat mainnet fork (ethers v6 +
  chai matchers), skipping when `MAINNET_RPC_URL` is unset.
- **CI** (`.github/workflows/ci.yml`): install → lint → format check → solhint →
  typecheck → compile → build → fork tests → coverage gate.

## Known limitation — shared position

All deposits/borrows route through the contract's single Aave account. The contract
tracks per-user totals but cannot prevent one user's withdrawal from drawing down
collateral that backs another user's debt (Aave only blocks it if the _whole_ position
would become unhealthy). A production design would isolate users via per-user
proxies/vaults or Aave credit delegation. This is intentionally out of scope.
