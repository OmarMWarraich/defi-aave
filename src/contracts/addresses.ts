import type { Address } from "viem";

// Deployed AaveDeFi contract address — set per environment in .env.
export const AAVEDEFI_ADDRESS = (import.meta.env.VITE_AAVEDEFI_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

// Token addresses for read-only balance display (Ethereum mainnet defaults).
export const DAI_ADDRESS =
  "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address;
// Aave v3 aEthWETH (collateral receipt held by the contract).
export const AWETH_ADDRESS =
  "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8" as Address;
