import { ethers, network, run } from "hardhat";

/**
 * Deploys the AaveDeFi contract.
 *
 * Replaces the legacy Truffle migration (migrations/2_deploy_contracts.js).
 * Run with:
 *   npx hardhat run scripts/deploy.ts --network <hardhat|sepolia|...>
 *
 * Protocol addresses are now injected via the constructor, so they live here
 * (per network) rather than hardcoded in the contract.
 *
 * ⚠️ VERIFY these against the official Aave v3 address book before any real
 * deployment — gateway/aToken addresses in particular are updated periodically:
 *   https://aave.com/docs/resources/addresses
 */

type AaveAddresses = {
  poolAddressesProvider: string;
  wethGateway: string;
  dai: string;
  aWeth: string;
};

// Aave v3 — Ethereum mainnet. Forked tests ("hardhat") reuse these.
const MAINNET: AaveAddresses = {
  poolAddressesProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
  wethGateway: "0xD322A49006FC828F9B5B37Ab215F99B4E5caB19C", // verify — WrappedTokenGatewayV3
  dai: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  aWeth: "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8", // aEthWETH
};

const ADDRESSES: Record<string, AaveAddresses> = {
  mainnet: MAINNET,
  hardhat: MAINNET, // in-process mainnet fork
  localhost: MAINNET,
  // sepolia: { ... } // fill from the Aave address book when targeting a testnet
};

// 0.6 of available borrow capacity, matching the original frontend safety factor.
const SAFETY_FACTOR_BPS = 6_000;

async function main() {
  const [deployer] = await ethers.getSigners();
  const addrs = ADDRESSES[network.name];
  if (!addrs) {
    throw new Error(
      `No Aave addresses configured for network "${network.name}". Add them in scripts/deploy.ts.`,
    );
  }

  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(
    `Balance:  ${ethers.formatEther(
      await ethers.provider.getBalance(deployer.address),
    )} ETH`,
  );

  const constructorArgs = [
    addrs.poolAddressesProvider,
    addrs.wethGateway,
    addrs.dai,
    addrs.aWeth,
    SAFETY_FACTOR_BPS,
  ];

  const factory = await ethers.getContractFactory("AaveDeFi");
  const aaveDeFi = await factory.deploy(...constructorArgs);
  await aaveDeFi.waitForDeployment();

  const address = await aaveDeFi.getAddress();
  console.log(`AaveDeFi deployed to: ${address}`);

  // Verify on Etherscan for public networks (skips local/forked nodes).
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Waiting for block confirmations before verification...");
    await aaveDeFi.deploymentTransaction()?.wait(5);
    try {
      await run("verify:verify", {
        address,
        constructorArguments: constructorArgs,
      });
    } catch (err) {
      console.warn(`Verification skipped/failed: ${(err as Error).message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
