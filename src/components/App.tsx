import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { erc20Abi, formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { aaveDeFiAbi } from "../contracts/aaveDeFi";
import { AAVEDEFI_ADDRESS, AWETH_ADDRESS, DAI_ADDRESS } from "../contracts/addresses";

const dai = (v: bigint | undefined) => (v === undefined ? "0" : formatUnits(v, 18));

function App() {
  const { address, isConnected } = useAccount();
  const [ethInput, setEthInput] = useState("");
  const [daiInput, setDaiInput] = useState("0");

  const aave = { address: AAVEDEFI_ADDRESS, abi: aaveDeFiAbi } as const;
  const enabledForAccount = { query: { enabled: !!address } } as const;

  // --- reads ---
  const { data: ethBalance } = useBalance({ address });
  const { data: daiBalance } = useReadContract({
    address: DAI_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    ...enabledForAccount,
  });
  const { data: aWethBalance } = useReadContract({
    address: AWETH_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [AAVEDEFI_ADDRESS],
  });
  const { data: totalETHDeposits } = useReadContract({
    ...aave,
    functionName: "totalETHDeposits",
    args: address ? [address] : undefined,
    ...enabledForAccount,
  });
  const { data: totalDAIBorrows } = useReadContract({
    ...aave,
    functionName: "totalDAIBorrows",
    args: address ? [address] : undefined,
    ...enabledForAccount,
  });
  const { data: daiPrice } = useReadContract({ ...aave, functionName: "daiPriceUSD" });
  const { data: maxSafeBorrow } = useReadContract({
    ...aave,
    functionName: "maxSafeBorrowDAI",
  });

  // --- write ---
  const { data: hash, isPending, error, writeContract } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  const loading = isPending || isConfirming;

  const onDepositBorrow = () => {
    if (!ethInput) return;
    // The requested DAI is validated on-chain against maxSafeBorrowDAI; no
    // browser-side float borrow math any more (see contracts/AaveDeFi.sol).
    writeContract({
      ...aave,
      functionName: "depositETHAndBorrowDAI",
      args: [parseUnits(daiInput || "0", 18)],
      value: parseEther(ethInput),
    });
  };

  const inputClass =
    "rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none";
  const thClass = "border-b px-4 py-2 text-left font-semibold text-gray-600";
  const tdClass = "px-4 py-2 font-mono";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <nav className="fixed inset-x-0 top-0 z-10 flex items-center justify-between bg-gray-900 px-4 py-3 text-white shadow">
        <span className="text-lg font-semibold">Aave DeFi</span>
        <ConnectButton />
      </nav>

      <main className="mx-auto max-w-3xl px-4 pt-24 pb-12 text-center">
        <h1 className="text-3xl font-bold">Aave DeFi DApp</h1>
        <p className="mt-2 text-gray-600">
          Deposit ETH as collateral on Aave v3 and borrow DAI against it.
        </p>

        {!isConnected ? (
          <p className="mt-10 text-gray-600">Connect your wallet to get started.</p>
        ) : (
          <>
            <div className="mx-auto mt-8 flex max-w-md flex-col gap-4 rounded-lg bg-white p-6 shadow">
              <label className="flex items-center justify-between gap-3">
                <span>ETH to deposit</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={ethInput}
                  placeholder="1.0"
                  onChange={(e) => setEthInput(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>DAI to borrow</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={daiInput}
                  placeholder="0"
                  onChange={(e) => setDaiInput(e.target.value)}
                  className={inputClass}
                />
              </label>
              <button
                onClick={onDepositBorrow}
                disabled={loading || !ethInput}
                className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Processing…" : "Deposit & Borrow"}
              </button>
              <p className="text-sm text-gray-500">
                Max safe DAI borrow (on-chain): {dai(maxSafeBorrow)}
              </p>
              {error && (
                <p className="text-sm text-red-600">
                  {(error as { shortMessage?: string }).shortMessage ?? error.message}
                </p>
              )}
            </div>

            <section className="mt-10">
              <h2 className="mb-3 text-lg font-medium">Wallet balances</h2>
              <div className="mx-auto inline-block overflow-hidden rounded-lg bg-white shadow">
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className={thClass}>ETH Balance</th>
                      <th className={thClass}>DAI Balance</th>
                      <th className={thClass}>aWETH (AaveDeFi contract)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={tdClass}>
                        {ethBalance ? formatEther(ethBalance.value) : "0"}
                      </td>
                      <td className={tdClass}>{dai(daiBalance)}</td>
                      <td className={tdClass}>{dai(aWethBalance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-10">
              <h2 className="mb-3 text-lg font-medium">Your totals on the AaveDeFi contract</h2>
              <div className="mx-auto inline-block overflow-hidden rounded-lg bg-white shadow">
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className={thClass}>Total ETH Deposits</th>
                      <th className={thClass}>Total DAI Borrows</th>
                      <th className={thClass}>DAI price (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={tdClass}>
                        {totalETHDeposits ? formatEther(totalETHDeposits) : "0"}
                      </td>
                      <td className={tdClass}>{dai(totalDAIBorrows)}</td>
                      <td className={tdClass}>{daiPrice ? formatUnits(daiPrice, 8) : "0"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
