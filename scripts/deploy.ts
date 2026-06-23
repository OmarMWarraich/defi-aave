import { ethers, network, run } from "hardhat";

/**
 * Deploys the AaveDeFi contract.
 *
 * Replaces the legacy Truffle migration (migrations/2_deploy_contracts.js).
 * Run with:
 *   npx hardhat run scripts/deploy.ts --network <hardhat|sepolia|...>
 *
 * NOTE: the contract currently hardcodes Aave v2 mainnet addresses in its
 * constructor (no args). When Phase 2 injects those via constructor args,
 * pass them to `deploy(...)` below.
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(
    `Balance:  ${ethers.formatEther(
      await ethers.provider.getBalance(deployer.address),
    )} ETH`,
  );

  const factory = await ethers.getContractFactory("AaveDeFi");
  const aaveDeFi = await factory.deploy();
  await aaveDeFi.waitForDeployment();

  const address = await aaveDeFi.getAddress();
  console.log(`AaveDeFi deployed to: ${address}`);

  // Verify on Etherscan for public networks (skips local/forked nodes).
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Waiting for block confirmations before verification...");
    await aaveDeFi.deploymentTransaction()?.wait(5);
    try {
      await run("verify:verify", { address, constructorArguments: [] });
    } catch (err) {
      console.warn(`Verification skipped/failed: ${(err as Error).message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
