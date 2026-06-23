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
- [x] Remove the committed `package-lock.json` only after the new toolchain is chosen, then regenerate. (Regenerated during the Hardhat install.)
- [x] Add `.env` + `.env.example` for RPC URLs and keys; ensure `.gitignore` covers `.env`, `cache/`, `artifacts/`, `typechain-types/`, `out/`, `coverage/`.
- [x] Confirm a license file exists (README says MIT) and add `LICENSE`.

## Phase 1 — Toolchain migration (Truffle → Hardhat or Foundry)

Pick one and delete the Truffle stack (`truffle-config.js`, `migrations/`, `.babelrc`, `babel-*` deps).

- [x] **Decision: Hardhat** (continuity with the JS frontend; Foundry can be added later as a fork-test add-on).
- [x] Delete the Truffle stack: removed `truffle-config.js`, `migrations/`, `.babelrc`, `babel-*` deps, `truffle` dep, and the Truffle-only `Migrations.sol`/`Migrations.json` bookkeeping artifacts.
- [x] Initialize Hardhat with `hardhat-toolbox` (ethers v6, chai matchers, gas reporter, coverage, verify). Added `hardhat.config.ts` (TS), `tsconfig.json`, deps + `compile`/`test:contracts`/`coverage` scripts. `npx hardhat compile` succeeds (solc 0.8.24).
- [x] Move contracts to a standard `contracts/` dir; configure compiler to a pinned recent `0.8.2x` with optimizer settings. (Moved all 5 `.sol` files; removed the `paths.sources` override; solc pinned to `0.8.24` + optimizer. Recompiles clean.)
- [x] Replace Ganache mainnet-fork workflow with **Hardhat Network forking** (`forking.url` from `.env`, pin a `blockNumber` for deterministic tests). `hardhat` network forks from `MAINNET_RPC_URL`, pins `FORK_BLOCK_NUMBER` (defaults to `19_000_000`); falls back to a non-forked node when no RPC is set (CI without secrets). Needs a real `MAINNET_RPC_URL` to exercise.
- [x] Add deployment scripts (`hardhat-deploy` or `scripts/deploy.ts`) replacing `migrations/`. `scripts/deploy.ts` (ethers v6) deploys `AaveDeFi` + auto-verifies on public networks. Smoke-tested: wiring works; deploy reverts in the constructor on a non-forked node (hardcoded mainnet addresses have no code) — works on a fork / once Phase 2 injects addresses.
- [x] Generate TypeChain typings for the frontend to consume. `hardhat-toolbox` runs TypeChain on every compile → `typechain-types/` (ethers-v6). Frontend *consuming* them is the Phase 4 task.

## Phase 2 — Smart contract refactor (Aave v2 → v3)

- [x] Upgrade `@openzeppelin/contracts` to **v5.x** (installed 5.6.1). Now using `SafeERC20`, `ReentrancyGuard`, `Ownable(msg.sender)`, `IERC20Metadata`.
- [x] Migrate from Aave v2 interfaces to **Aave v3** (slim local interfaces under `contracts/interfaces/`, instead of pulling the heavy `@aave/core-v3` + `@aave/periphery-v3` packages — see note below):
  - `ILendingPoolAddressesProvider` → `IPoolAddressesProvider` (`getPool()` / `getPriceOracle()`)
  - `ILendingPool` → `IPool` (`supply`/`withdraw`/`borrow`/`repay`; `getUserAccountData` now USD-based)
  - `IWETHGateway` → `IWrappedTokenGatewayV3` (`depositETH`/`withdrawETH`)
  - `IPriceOracle` → `IAaveOracle` (USD, 8 decimals; borrow math updated accordingly)
- [x] Stop hardcoding mainnet addresses in the constructor; inject them via constructor args. Addresses now live (per-network) in `scripts/deploy.ts`.
- [x] **Add the missing lifecycle functions:** `repayDAI`, `withdrawETH` (with events) so collateral isn't stranded.
- [x] Security fixes:
  - [x] Use `SafeERC20` (`safeTransfer`/`safeTransferFrom`/`forceApprove`) instead of raw `transfer`.
  - [x] Add `ReentrancyGuard` (`nonReentrant`) to all state-changing external functions.
  - [x] Add access control (`Ownable`) — `setSafetyFactor`, `rescueERC20`.
  - [x] Replace misused `assert` with custom errors (`ZeroAmount`, `OraclePriceZero`, `BorrowExceedsSafeMax`, `InsufficientDeposit`, `InvalidSafetyFactor`).
  - [x] Validate borrow on-chain: `_maxSafeBorrowDAI` derives the cap from `getUserAccountData` + oracle price × `safetyFactorBps`; reverts if the request exceeds it.
- [x] Add NatSpec to all public/external functions.

> **Phase 2 notes / follow-ups:**
> - Used **slim local v3 interfaces** rather than the official `@aave/*` packages (those pin `0.8.10` and pull large import trees). Trade-off: fewer deps & a clean 0.8.24 build vs. not tracking upstream interface changes automatically.
> - **API renames** (frontend Phase 4 + tests Phase 3 must follow): `borrowDAIAgainstETH` → `depositETHAndBorrowDAI`; `daiEthprice` (storage) → `daiPriceUSD()` (view); added `repayDAI`, `withdrawETH`, `maxSafeBorrowDAI`.
> - **Architectural limitation retained:** all users share one Aave position (`address(this)`); documented in the contract. Per-user vaults are out of scope.
> - **Deploy addresses** in `scripts/deploy.ts` (gateway/aWETH especially) are flagged to verify against the official Aave address book before any real deployment.
> - Compiles clean (`0.8.24`). Real behavior is only verifiable on a mainnet fork (needs `MAINNET_RPC_URL`) — covered by Phase 3 tests.

## Phase 3 — Test suite

- [x] Rewrite `test/AaveDeFi.test.js` as Hardhat + chai-matchers (or Foundry fork tests) against a **pinned** mainnet fork. New `test/AaveDeFi.test.ts` (ethers v6, `loadFixture`, typed via TypeChain). Auto-skips when `MAINNET_RPC_URL` is unset (14 pending → CI-safe); fork block pinned via config. **Only the skip path is verified here — actually running green needs a real `MAINNET_RPC_URL` (and may need address/block tweaks).**
- [x] Convert from web3.js patterns to ethers v6. Tests/scripts are now pure ethers v6 (verified: no `web3`/`.methods`/`toWei`/`HttpProvider`/`artifacts.require` on the Hardhat side). The remaining `web3@1.3.6` dep is only used by the frontend (`src/`) — removed in Phase 4.
- [x] Cover: deposit, borrow, repay, withdraw, event emission, revert paths, oracle price usage, and balance assertions. 16 cases in `AaveDeFi.test.ts`: lifecycle (deposit/borrow/repay/withdraw); events asserted with `.withArgs` (`anyValue` for the dynamic oracle price); reverts (`ZeroAmount`, `BorrowExceedsSafeMax`, `InsufficientDeposit`, zero-repay, `OwnableUnauthorizedAccount`); oracle (sane DAI price ~1e8, positive safe-borrow cap); balances (DAI deltas on borrow+repay, aWETH credited on deposit, `changeEtherBalance` on withdraw). **Assertions only execute on a real fork** (suite skips without `MAINNET_RPC_URL`).
- [x] Add `solidity-coverage` and a gas report; set a minimum coverage threshold. `.solcover.js` (skips `interfaces/`, emits `json-summary`); `hardhat coverage` runs clean. Gas via `hardhat-gas-reporter` (`npm run test:gas` / `REPORT_GAS=true`). Threshold gate in `scripts/check-coverage.js` (lines/stmts/funcs ≥80%, branches ≥60%) wired as `npm run coverage:check`; fork-aware (no-op without `MAINNET_RPC_URL`, enforced in CI). **Actual % and gas numbers only populate on a real fork** — both are ~0/empty here since tests skip.
- [ ] (Optional) Add Foundry invariant/fuzz tests for the borrow math.

## Phase 4 — Frontend rewrite (CRA/React 16 → Vite + React 18/19)

- [x] Replace `react-scripts`/CRA with **Vite** + TypeScript. Added `vite.config.ts`, root `index.html`, TS entry `src/main.tsx` (React 18 `createRoot` + StrictMode), `tsconfig.app.json`. Bumped React 16→18, dropped `react-scripts`/CRA + unused `react-bootstrap`; scripts are now `dev`/`build`/`preview`/`typecheck:web`. Verified: `typecheck:web` passes, `vite build` succeeds, dev server serves HTTP 200, and Hardhat still compiles (toolchains coexist). **Transitional shim:** `vite-plugin-node-polyfills` lets web3 1.x bundle — remove it when the frontend moves to viem/wagmi. Legacy `App.jsx` (class component + web3) is intentionally untouched here — that's the next checkbox.
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

## Deferred / out-of-scope (future work)

- **Aave interface strategy — _decided: stick with slim local interfaces for now._**
  Phase 2 defines minimal v3 interfaces under `contracts/interfaces/` rather than depending on
  the official `@aave/core-v3` + `@aave/periphery-v3` packages. This keeps a clean single-compiler
  (`0.8.24`) build and a small dependency tree.
  - _Trade-off:_ we don't automatically track upstream Aave interface changes; if a signature
    drifts, our local copy must be updated by hand.
  - _Future option (out of scope):_ migrate to the official `@aave/*` packages (or their address-book
    helpers) for canonical interfaces and addresses. Revisit only if integrating more of the protocol
    surface or if upstream drift becomes a maintenance burden.
- **Per-user vault architecture (out of scope).** The contract intentionally keeps the original
  single shared Aave position (`address(this)`) with off-protocol per-user accounting. A safe
  multi-user design would isolate each user's collateral/debt (e.g. per-user proxy/vault or credit
  delegation). Documented inline in `AaveDeFi.sol`; tracked here as future work.
- **API renames & deploy-address verification** from the Phase 2 rewrite are recorded in the
  "Phase 2 notes / follow-ups" block above (frontend/tests must follow the renames; gateway/aWETH
  addresses must be verified against the Aave address book before any real deployment).

## Open decisions (resolve before starting)

1. ~~**Hardhat vs Foundry**~~ — **decided: Hardhat** (Foundry fork tests remain an optional add-on).
2. **viem/wagmi vs ethers-only** frontend (recommend wagmi + viem + RainbowKit).
3. **Target network**: keep mainnet-fork-only, or add Sepolia/L2 deployment?
4. **Styling**: Bootstrap 5 vs Tailwind.
5. **TypeScript**: adopt across contracts tests + frontend (recommended) or stay JS.
