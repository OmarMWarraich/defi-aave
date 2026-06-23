# AaveDeFi

A full-stack demo dApp that deposits ETH as collateral into the **Aave v3** lending
protocol and borrows **DAI** against it — then lets you repay the DAI and withdraw the
ETH. Originally a DappUniversity (Truffle/web3/CRA, Aave v2) tutorial, now modernized
to a current (2026) toolchain.

> ⚠️ **Educational project, not production.** All users share a single Aave position
> (the contract's own address); per-user balances are tracked off-protocol. Aave's
> health-factor checks keep the shared position solvent, but the contract does not
> enforce fairness between users. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for details.
> Deploy addresses in `scripts/deploy.ts` must be verified against the official Aave
> address book before any real deployment.

## Technology stack

| Layer           | Tooling                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Smart contracts | [Solidity 0.8.24](https://docs.soliditylang.org/), [OpenZeppelin v5](https://docs.openzeppelin.com/contracts/5.x/)                               |
| Protocol        | [Aave v3](https://aave.com/) (Pool, Oracle, WrappedTokenGatewayV3)                                                                               |
| Dev framework   | [Hardhat](https://hardhat.org/) + `hardhat-toolbox` (ethers v6, TypeChain, gas reporter, coverage, verify)                                       |
| Local chain     | Hardhat Network **mainnet fork**                                                                                                                 |
| Frontend        | [Vite](https://vitejs.dev/) + [React 18](https://react.dev/) + TypeScript                                                                        |
| Wallet / chain  | [wagmi](https://wagmi.sh/) + [viem](https://viem.sh/) + [RainbowKit](https://www.rainbowkit.com/) + [TanStack Query](https://tanstack.com/query) |
| Styling         | [Tailwind CSS v4](https://tailwindcss.com/)                                                                                                      |
| Quality         | ESLint (flat config), Prettier (+ Solidity plugin), solhint, GitHub Actions CI                                                                   |

## Prerequisites

- **Node 20 LTS** (see `.nvmrc`; run `nvm use`)
- An Ethereum RPC URL (Alchemy / Infura) for mainnet forking and deployment
- A browser wallet (e.g. MetaMask) to use the dApp

## Setup

```sh
npm install
cp .env.example .env   # then fill in the values below
```

### Environment variables (`.env`)

| Variable                        | Used for                                                              |
| ------------------------------- | --------------------------------------------------------------------- |
| `MAINNET_RPC_URL`               | Mainnet forking (tests/coverage) and mainnet deploys                  |
| `SEPOLIA_RPC_URL`               | Sepolia deploys                                                       |
| `FORK_BLOCK_NUMBER`             | Pin the fork block for deterministic tests (defaults to `19_000_000`) |
| `DEPLOYER_PRIVATE_KEY`          | Deployer account (use a throwaway key)                                |
| `ETHERSCAN_API_KEY`             | Contract verification                                                 |
| `VITE_AAVEDEFI_ADDRESS`         | Deployed AaveDeFi address the frontend reads/writes                   |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project id (RainbowKit)                           |
| `VITE_CHAIN_ID`, `VITE_RPC_URL` | Frontend chain config                                                 |

Only `VITE_`-prefixed variables are exposed to the browser.

## Smart contracts (Hardhat)

```sh
npm run compile          # compile + generate TypeChain types
npm test                 # run the test suite (alias for test:contracts)
npm run test:contracts   # mainnet-fork tests (skip unless MAINNET_RPC_URL is set)
npm run test:gas         # tests with a gas report
npm run coverage         # solidity-coverage report
npm run coverage:check   # coverage + threshold gate (fork-aware)
npm run lint:sol         # solhint
```

The tests fork mainnet automatically when `MAINNET_RPC_URL` is set (Hardhat Network
`forking`), pinned to `FORK_BLOCK_NUMBER` for determinism. Without an RPC the fork
suite **skips** rather than failing — handy for CI without secrets. (This replaces the
old `ganache-cli -f` + `truffle test` workflow.)

### Deployment

Protocol addresses are injected via the constructor and configured per-network in
`scripts/deploy.ts` (verify them against the Aave address book first).

```sh
npm run deploy:local     # deploy against the default Hardhat network (fork)
npm run deploy:sepolia   # deploy + auto-verify on Sepolia
```

## Frontend (Vite)

```sh
npm run dev              # dev server on http://localhost:3000
npm run build            # production build to dist/
npm run preview          # preview the production build
npm run typecheck:web    # type-check the frontend
npm run lint             # ESLint
npm run format           # Prettier
```

### Using the dApp

1. `npm run dev`, open the app, and connect a wallet (RainbowKit).
2. Set `VITE_AAVEDEFI_ADDRESS` to your deployed contract.
3. Enter an ETH amount to deposit and a DAI amount to borrow, then **Deposit & Borrow**.
   The requested DAI is validated on-chain against `maxSafeBorrowDAI` (the contract
   computes the safe cap from Aave's oracle + your collateral — no browser-side math).

## Project structure

```
contracts/            AaveDeFi.sol + interfaces/ (slim Aave v3 interfaces)
scripts/              deploy.ts, check-coverage.js
test/                 AaveDeFi.test.ts (mainnet-fork tests)
src/                  Vite + React frontend
  components/App.tsx  main UI (wagmi hooks + RainbowKit)
  contracts/          typed ABI + addresses
  wagmi.ts            wagmi/RainbowKit config
hardhat.config.ts     Hardhat config (forking, networks, verify)
vite.config.mts       Vite config (React + Tailwind)
.github/workflows/    CI
```

## Roadmap / extension ideas

- Per-user vaults so collateral/debt are isolated between users (current design shares one position).
- Support arbitrary ERC20 collateral/borrow assets beyond ETH→DAI.
- Surface interest rates, health factor, and liquidation metrics from `getUserAccountData`.
- Transaction history via contract events (`DepositBorrow` / `Repay` / `Withdraw`).
- Foundry fuzz/invariant tests for the borrow math.

## License

[MIT](./LICENSE)
