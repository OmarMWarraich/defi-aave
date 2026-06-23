# TODO — Modernizing AaveDeFi

Refactor plan to bring this legacy DappUniversity-era project up to current (2026) tooling,
dependencies, and documentation. The stack as-is is almost entirely end-of-life.

## Current state (audit)

| Area | Current | Status |
|------|---------|--------|
| Protocol | Aave **v2** (hardcoded mainnet addresses) | v2 deprecated; v3 is current, v4 in progress |
| Smart-contract framework | Truffle ^5.3.6 + Ganache | **Sunset by Consensys (Sept 2023)** |
| Solidity | ^0.8.4 | Old; current is 0.8.2x |
| Contract libs | @openzeppelin/contracts ^4.1.0 | v5.x is current |
| Web3 lib | web3.js ^1.3.6 | 1.x EOL; v4 exists, ecosystem moved to viem/ethers |
| Frontend | React 16.8 **class components** + CRA (react-scripts ^2.1.8) | **CRA deprecated**; react-scripts 2 is ancient |
| Build/transpile | babel-register + babel-preset-es2015/stage-2/stage-3 | Long-deprecated presets |
| Wallet connect | `window.ethereum.enable()` + `componentWillMount` | Both deprecated APIs |
| Styling | bootstrap 4.3.1 + react-bootstrap 1.0.0-beta.5 | Outdated; beta dep |
| Node | 14.15.4 (per README) | EOL; target 20 LTS / 22 |
| Testing | Truffle + chai against a live mainnet fork | Brittle, no CI |
| Tooling | No linter/formatter/CI/.env handling | Missing |

> ⚠️ **Security note up front:** the contract deposits ETH and borrows DAI but has **no
> withdraw/repay path** — collateral (aWETH) gets stranded in the contract. There is no
> access control, no reentrancy guard, raw `transfer` instead of `SafeERC20`, and the
> borrow amount is computed with floating-point math in the browser. Treat the existing
> contract as a learning artifact, not something to deploy.

---

## Phase 0 — Repo hygiene & baseline

- [x] `git init` (project is not currently a git repo) and commit the legacy code as the baseline.
- [ ] Remove the committed `package-lock.json` only after the new toolchain is chosen, then regenerate.
- [x] Add `.env` + `.env.example` for RPC URLs and keys; ensure `.gitignore` covers `.env`, `cache/`, `artifacts/`, `typechain-types/`, `out/`, `coverage/`.
- [x] Confirm a license file exists (README says MIT) and add `LICENSE`.

## Phase 1 — Toolchain migration (Truffle → Hardhat or Foundry)

Pick one and delete the Truffle stack (`truffle-config.js`, `migrations/`, `.babelrc`, `babel-*` deps).

- [x] **Decision: Hardhat** (continuity with the JS frontend; Foundry can be added later as a fork-test add-on).
- [x] Delete the Truffle stack: removed `truffle-config.js`, `migrations/`, `.babelrc`, `babel-*` deps, `truffle` dep, and the Truffle-only `Migrations.sol`/`Migrations.json` bookkeeping artifacts.
- [ ] Initialize Hardhat with `hardhat-toolbox` (ethers v6, chai matchers, gas reporter, coverage, verify).
- [ ] Move contracts to a standard `contracts/` dir; configure compiler to a pinned recent `0.8.2x` with optimizer settings.
- [ ] Replace Ganache mainnet-fork workflow with **Hardhat Network forking** (`forking.url` from `.env`, pin a `blockNumber` for deterministic tests).
- [ ] Add deployment scripts (`hardhat-deploy` or `scripts/deploy.ts`) replacing `migrations/`.
- [ ] Generate TypeChain typings for the frontend to consume.

## Phase 2 — Smart contract refactor (Aave v2 → v3)

- [ ] Upgrade `@openzeppelin/contracts` to **v5.x**; update imports (`IERC20` path unchanged, but review breaking changes).
- [ ] Migrate from Aave v2 interfaces to **Aave v3** (`@aave/core-v3`):
  - `ILendingPoolAddressesProvider` → `IPoolAddressesProvider`
  - `ILendingPool` → `IPool` (`getPool()` instead of `getLendingPool()`)
  - `IWETHGateway` → v3 `WrappedTokenGatewayV3`
  - `IPriceOracle` → v3 `IAaveOracle` (**note: v3 oracle returns USD-denominated, 8 decimals**, not ETH-denominated like v2 — the borrow math changes).
- [ ] Stop hardcoding mainnet addresses in the constructor; inject them via constructor args / config so the contract is testable on forks and deployable to testnets (Sepolia) and L2s.
- [ ] **Add the missing lifecycle functions:** `repayDAI`, `withdrawETH` (and event emission) so collateral isn't stranded.
- [ ] Security fixes:
  - [ ] Use `SafeERC20` (`safeTransfer`) instead of raw `transfer`.
  - [ ] Add `ReentrancyGuard` to state-changing external functions.
  - [ ] Add access control (`Ownable`/role) where appropriate.
  - [ ] Replace misused `assert` with `require` + descriptive errors / custom errors.
  - [ ] Validate `safeMaxDAIBorrow` on-chain (don't trust a browser-computed number) or compute the safe amount in-contract using the oracle + LTV from `getUserAccountData`.
- [ ] Add NatSpec to all public/external functions.

## Phase 3 — Test suite

- [ ] Rewrite `test/AaveDeFi.test.js` as Hardhat + chai-matchers (or Foundry fork tests) against a **pinned** mainnet fork.
- [ ] Convert from web3.js patterns to ethers v6.
- [ ] Cover: deposit, borrow, repay, withdraw, event emission, revert paths, oracle price usage, and balance assertions.
- [ ] Add `solidity-coverage` and a gas report; set a minimum coverage threshold.
- [ ] (Optional) Add Foundry invariant/fuzz tests for the borrow math.

## Phase 4 — Frontend rewrite (CRA/React 16 → Vite + React 18/19)

- [ ] Replace `react-scripts`/CRA with **Vite** + TypeScript.
- [ ] Convert `App.js` class component to a **function component with hooks**; remove `componentWillMount`.
- [ ] Replace manual `web3.js` + `window.ethereum.enable()` wiring with a modern stack:
  - **wagmi + viem** for contract reads/writes and chain state.
  - **RainbowKit** (or Web3Modal/ConnectKit) for wallet connection (handles EIP-1193/1102, multi-wallet).
  - TanStack Query (bundled with wagmi) for data fetching/caching.
- [ ] Replace ad-hoc `fromWei`/`toWei` string math with viem's `formatUnits`/`parseUnits` (correct decimals per token — DAI is 18, but don't assume).
- [ ] Move the borrow-amount calculation out of float JS; rely on the on-chain safe value (see Phase 2).
- [ ] Replace `bootstrap`/`react-bootstrap` beta with current Bootstrap 5 or Tailwind — pick one and remove the other deps.
- [ ] Remove the legacy `serviceWorker.js` (CRA artifact) unless PWA support is actually wanted.
- [ ] Consume TypeChain/typed ABIs instead of importing raw JSON from `src/abis/`.
- [ ] Add error/loading states and basic input validation.

## Phase 5 — Quality & CI

- [ ] Add ESLint (flat config) + Prettier; add `solhint` + `prettier-plugin-solidity` for contracts.
- [ ] Add a GitHub Actions workflow: install → lint → compile → test (with fork RPC secret) → coverage.
- [ ] Add `npm` scripts: `dev`, `build`, `test`, `test:contracts`, `lint`, `format`, `deploy:sepolia`.
- [ ] Run `npm audit` and resolve the (many) advisories the old deps carry.
- [ ] Pin Node version via `.nvmrc` / `engines` to **20 LTS** (or 22).

## Phase 6 — Documentation

- [ ] Rewrite `README.md`:
  - Update the entire "Technology Stack" section to the new tools.
  - Replace Ganache/Infura instructions with Hardhat fork + `.env` setup.
  - Document `.env.example` variables (RPC URL, deployer key, Etherscan key).
  - Update Node version, install, run, test, and deploy commands.
  - Note that the dapp targets Aave **v3**, and which network(s)/addresses.
- [ ] Add an `ARCHITECTURE.md` (contract ↔ frontend ↔ Aave interaction diagram).
- [ ] Add inline NatSpec/JSDoc; document the borrow math and safety factor assumptions.
- [ ] Update the "To do app extension ideas" list and link/remove the empty video link.

---

## Suggested order

`Phase 0 → 1 → 2 → 3` (get contracts modern, tested, and green on a fork first),
then `4 → 5 → 6` (frontend, CI, docs). Phases 5 and 6 can run alongside 4.

## Open decisions (resolve before starting)

1. **Hardhat vs Foundry** (recommend Hardhat + optional Foundry fork tests).
2. **viem/wagmi vs ethers-only** frontend (recommend wagmi + viem + RainbowKit).
3. **Target network**: keep mainnet-fork-only, or add Sepolia/L2 deployment?
4. **Styling**: Bootstrap 5 vs Tailwind.
5. **TypeScript**: adopt across contracts tests + frontend (recommended) or stay JS.
