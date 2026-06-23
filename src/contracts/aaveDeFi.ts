// Typed ABI for the AaveDeFi v3 contract (the subset the UI uses).
// `as const` gives viem/wagmi full type inference for args & return values.
// Mirrors contracts/AaveDeFi.sol — keep in sync (or generate via `wagmi generate`).
export const aaveDeFiAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "totalETHDeposits",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalDAIBorrows",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "daiPriceUSD",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "maxSafeBorrowDAI",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "depositETHAndBorrowDAI",
    stateMutability: "payable",
    inputs: [{ name: "requestedDAI", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "repayDAI",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawETH",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;
