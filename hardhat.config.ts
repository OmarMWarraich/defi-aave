import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const {
  MAINNET_RPC_URL,
  SEPOLIA_RPC_URL,
  FORK_BLOCK_NUMBER,
  DEPLOYER_PRIVATE_KEY,
  ETHERSCAN_API_KEY,
} = process.env;

// Pin a default mainnet block so fork tests are deterministic even when
// FORK_BLOCK_NUMBER is unset. Aave v2 has been live on mainnet since 2020,
// so this (early-2024) block has all the protocol contracts deployed.
// Override per-run via FORK_BLOCK_NUMBER in .env.
const DEFAULT_FORK_BLOCK_NUMBER = 19_000_000;

const config: HardhatUserConfig = {
  solidity: {
    // Aave v3 / OpenZeppelin v5 require ^0.8.20; pin a recent patch.
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Default in-process network. Forks mainnet so tests can hit live Aave.
    hardhat: MAINNET_RPC_URL
      ? {
          forking: {
            url: MAINNET_RPC_URL,
            blockNumber: FORK_BLOCK_NUMBER
              ? Number(FORK_BLOCK_NUMBER)
              : DEFAULT_FORK_BLOCK_NUMBER,
          },
        }
      : {},
    sepolia: {
      url: SEPOLIA_RPC_URL ?? "",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY ?? "",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
