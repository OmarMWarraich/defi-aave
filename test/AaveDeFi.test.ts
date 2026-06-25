import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import type { AaveDeFi } from "../typechain-types";

/**
 * Fork tests for AaveDeFi against Aave v3 on an Ethereum mainnet fork.
 *
 * Requires a real fork: set MAINNET_RPC_URL (and optionally FORK_BLOCK_NUMBER)
 * in .env. The whole suite is skipped when no RPC is configured, so CI without
 * a secret RPC stays green. The fork block is pinned in hardhat.config.ts for
 * deterministic results.
 */

// Aave v3 — Ethereum mainnet (mirror of scripts/deploy.ts). Verify against the
// official Aave address book before trusting beyond tests.
const POOL_ADDRESSES_PROVIDER = "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e";
const WETH_GATEWAY = "0xD322A49006FC828F9B5B37Ab215F99B4E5caB19C";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const AWETH = "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8";
const SAFETY_FACTOR_BPS = 6_000n;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

const hasFork = Boolean(process.env.MAINNET_RPC_URL);
const describeFork = hasFork ? describe : describe.skip;

if (!hasFork) {
  console.warn(
    "\n  ⚠️  Skipping AaveDeFi fork tests: set MAINNET_RPC_URL in .env to run them.\n",
  );
}

describeFork("AaveDeFi (mainnet fork)", () => {
  async function deployFixture() {
    const [deployer, borrower] = await ethers.getSigners();

    const factory = await ethers.getContractFactory("AaveDeFi");
    const aaveDeFi = (await factory.deploy(
      POOL_ADDRESSES_PROVIDER,
      WETH_GATEWAY,
      DAI,
      AWETH,
      SAFETY_FACTOR_BPS,
    )) as unknown as AaveDeFi;
    await aaveDeFi.waitForDeployment();

    const dai = new ethers.Contract(DAI, ERC20_ABI, borrower);
    const aWeth = new ethers.Contract(AWETH, ERC20_ABI, borrower);

    return { aaveDeFi, deployer, borrower, dai, aWeth };
  }

  describe("deployment", () => {
    it("sets the contract name", async () => {
      const { aaveDeFi } = await loadFixture(deployFixture);
      expect(await aaveDeFi.name()).to.equal("MY Aave DeFi");
    });

    it("records the injected addresses provider", async () => {
      const { aaveDeFi } = await loadFixture(deployFixture);
      expect(await aaveDeFi.provider()).to.equal(POOL_ADDRESSES_PROVIDER);
    });

    it("resolves the pool from the provider", async () => {
      const { aaveDeFi } = await loadFixture(deployFixture);
      const pool = await aaveDeFi.pool();
      expect(ethers.isAddress(pool)).to.equal(true);
      expect(pool).to.not.equal(ethers.ZeroAddress);
    });

    it("assigns ownership to the deployer", async () => {
      const { aaveDeFi, deployer } = await loadFixture(deployFixture);
      expect(await aaveDeFi.owner()).to.equal(deployer.address);
    });
  });

  describe("oracle price usage", () => {
    it("reads a sane DAI price from the Aave oracle (USD, 8 decimals)", async () => {
      const { aaveDeFi } = await loadFixture(deployFixture);
      const price = await aaveDeFi.daiPriceUSD();
      // DAI is ~$1, so the 8-decimal USD price should sit near 1e8.
      expect(price).to.be.greaterThan(0n);
      expect(price).to.be.greaterThan(ethers.parseUnits("0.9", 8));
      expect(price).to.be.lessThan(ethers.parseUnits("1.1", 8));
    });

    it("derives a positive safe-borrow cap once collateral exists", async () => {
      const { aaveDeFi, borrower } = await loadFixture(deployFixture);
      await aaveDeFi
        .connect(borrower)
        .depositETHAndBorrowDAI(0n, { value: ethers.parseEther("1") });
      expect(await aaveDeFi.maxSafeBorrowDAI()).to.be.greaterThan(0n);
    });
  });

  describe("depositETHAndBorrowDAI", () => {
    const oneEth = ethers.parseEther("1");

    it("reverts when no ETH is sent", async () => {
      const { aaveDeFi, borrower } = await loadFixture(deployFixture);
      await expect(
        aaveDeFi.connect(borrower).depositETHAndBorrowDAI(0n, { value: 0n }),
      ).to.be.revertedWithCustomError(aaveDeFi, "ZeroAmount");
    });

    it("deposits ETH collateral (borrow = 0), emits the event, and receives aWETH", async () => {
      const { aaveDeFi, borrower, aWeth } = await loadFixture(deployFixture);
      const contractAddr = await aaveDeFi.getAddress();
      const aWethBefore = await aWeth.balanceOf(contractAddr);

      // DepositBorrow(user, ethDeposited, totalETHDeposits, daiPrice, daiBorrowed, totalDAIBorrows)
      await expect(
        aaveDeFi
          .connect(borrower)
          .depositETHAndBorrowDAI(0n, { value: oneEth }),
      )
        .to.emit(aaveDeFi, "DepositBorrow")
        .withArgs(borrower.address, oneEth, oneEth, anyValue, 0n, 0n);

      expect(await aaveDeFi.totalETHDeposits(borrower.address)).to.equal(
        oneEth,
      );
      // aWETH (interest-bearing) credited to the contract is at least the deposit.
      const aWethAfter = await aWeth.balanceOf(contractAddr);
      expect(aWethAfter - aWethBefore).to.be.greaterThanOrEqual(oneEth);
    });

    it("reverts when the requested DAI exceeds the safe max", async () => {
      const { aaveDeFi, borrower } = await loadFixture(deployFixture);
      // Deposit collateral first so a safe max exists.
      await aaveDeFi
        .connect(borrower)
        .depositETHAndBorrowDAI(0n, { value: oneEth });

      const safeMax = await aaveDeFi.maxSafeBorrowDAI();
      // Multiply by 10 so the amount exceeds the safe max even after the second
      // deposit (which doubles collateral and thus roughly doubles safe max).
      await expect(
        aaveDeFi
          .connect(borrower)
          .depositETHAndBorrowDAI(safeMax * 10n, { value: oneEth }),
      ).to.be.revertedWithCustomError(aaveDeFi, "BorrowExceedsSafeMax");
    });

    it("borrows DAI against deposited ETH and sends it to the caller", async () => {
      const { aaveDeFi, borrower, dai } = await loadFixture(deployFixture);

      // Establish collateral, then borrow a conservative fraction of capacity.
      await aaveDeFi
        .connect(borrower)
        .depositETHAndBorrowDAI(0n, { value: oneEth });
      const safeMax = await aaveDeFi.maxSafeBorrowDAI();
      const borrowAmount = safeMax / 2n;
      expect(borrowAmount).to.be.greaterThan(0n);

      const before = await dai.balanceOf(borrower.address);
      await expect(
        aaveDeFi
          .connect(borrower)
          .depositETHAndBorrowDAI(borrowAmount, { value: oneEth }),
      ).to.emit(aaveDeFi, "DepositBorrow");

      const after = await dai.balanceOf(borrower.address);
      expect(after - before).to.equal(borrowAmount);
      expect(await aaveDeFi.totalDAIBorrows(borrower.address)).to.equal(
        borrowAmount,
      );
    });
  });

  describe("repayDAI", () => {
    const oneEth = ethers.parseEther("1");

    it("repays borrowed DAI and reduces tracked debt", async () => {
      const { aaveDeFi, borrower, dai } = await loadFixture(deployFixture);

      await aaveDeFi
        .connect(borrower)
        .depositETHAndBorrowDAI(0n, { value: oneEth });
      const borrowAmount = (await aaveDeFi.maxSafeBorrowDAI()) / 2n;
      await aaveDeFi
        .connect(borrower)
        .depositETHAndBorrowDAI(borrowAmount, { value: oneEth });

      const daiBefore = await dai.balanceOf(borrower.address);
      await dai.approve(await aaveDeFi.getAddress(), borrowAmount);

      // Repay(user, daiRepaid, totalDAIBorrows). Debt >= amount, so repaid == amount.
      await expect(aaveDeFi.connect(borrower).repayDAI(borrowAmount))
        .to.emit(aaveDeFi, "Repay")
        .withArgs(borrower.address, borrowAmount, 0n);

      expect(await aaveDeFi.totalDAIBorrows(borrower.address)).to.equal(0n);
      // Borrower's DAI is spent on the repayment.
      const daiAfter = await dai.balanceOf(borrower.address);
      expect(daiBefore - daiAfter).to.equal(borrowAmount);
    });

    it("reverts on a zero repay", async () => {
      const { aaveDeFi, borrower } = await loadFixture(deployFixture);
      await expect(
        aaveDeFi.connect(borrower).repayDAI(0n),
      ).to.be.revertedWithCustomError(aaveDeFi, "ZeroAmount");
    });
  });

  describe("withdrawETH", () => {
    const oneEth = ethers.parseEther("1");

    it("reverts when withdrawing more than deposited", async () => {
      const { aaveDeFi, borrower } = await loadFixture(deployFixture);
      await aaveDeFi
        .connect(borrower)
        .depositETHAndBorrowDAI(0n, { value: oneEth });
      await expect(
        aaveDeFi.connect(borrower).withdrawETH(oneEth * 2n),
      ).to.be.revertedWithCustomError(aaveDeFi, "InsufficientDeposit");
    });

    it("withdraws ETH collateral and reduces the tracked deposit", async () => {
      const { aaveDeFi, borrower } = await loadFixture(deployFixture);
      // Deposit collateral with no debt so it can be fully withdrawn.
      await aaveDeFi
        .connect(borrower)
        .depositETHAndBorrowDAI(0n, { value: oneEth });

      const withdrawAmount = ethers.parseEther("0.5");

      // Withdraw(user, ethWithdrawn, totalETHDeposits). changeEtherBalance
      // excludes gas by default, isolating the ETH returned to the caller.
      // changeEtherBalance cannot be chained after emit — split into two expects.
      const withdrawTx = aaveDeFi.connect(borrower).withdrawETH(withdrawAmount);
      await expect(withdrawTx)
        .to.emit(aaveDeFi, "Withdraw")
        .withArgs(borrower.address, withdrawAmount, oneEth - withdrawAmount);
      await expect(withdrawTx).to.changeEtherBalance(borrower, withdrawAmount);

      expect(await aaveDeFi.totalETHDeposits(borrower.address)).to.equal(
        oneEth - withdrawAmount,
      );
    });
  });

  describe("access control", () => {
    it("lets the owner update the safety factor", async () => {
      const { aaveDeFi, deployer } = await loadFixture(deployFixture);
      await expect(aaveDeFi.connect(deployer).setSafetyFactor(5_000n))
        .to.emit(aaveDeFi, "SafetyFactorUpdated")
        .withArgs(SAFETY_FACTOR_BPS, 5_000n);
      expect(await aaveDeFi.safetyFactorBps()).to.equal(5_000n);
    });

    it("blocks non-owners from updating the safety factor", async () => {
      const { aaveDeFi, borrower } = await loadFixture(deployFixture);
      await expect(
        aaveDeFi.connect(borrower).setSafetyFactor(5_000n),
      ).to.be.revertedWithCustomError(aaveDeFi, "OwnableUnauthorizedAccount");
    });
  });
});
