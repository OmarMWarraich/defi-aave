import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  erc20Abi,
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
} from "viem";
import { aaveDeFiAbi } from "../contracts/aaveDeFi";
import {
  AAVEDEFI_ADDRESS,
  AWETH_ADDRESS,
  DAI_ADDRESS,
} from "../contracts/addresses";

const dai = (v: bigint | undefined) =>
  v === undefined ? "0" : formatUnits(v, 18);

function App() {
  const { address, isConnected } = useAccount();
  const [ethInput, setEthInput] = useState("");
  const [daiInput, setDaiInput] = useState("0");

  const aave = { address: AAVEDEFI_ADDRESS, abi: aaveDeFiAbi } as const;
  const enabledForAccount = { query: { enabled: !!address } } as const;

  // --- reads ---
  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address,
  });
  const { data: daiBalance, refetch: refetchDaiBalance } = useReadContract({
    address: DAI_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    ...enabledForAccount,
  });
  const { data: aWethBalance, refetch: refetchAWethBalance } = useReadContract({
    address: AWETH_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [AAVEDEFI_ADDRESS],
  });
  const { data: totalETHDeposits, refetch: refetchTotalEthDeposits } =
    useReadContract({
      ...aave,
      functionName: "totalETHDeposits",
      args: address ? [address] : undefined,
      ...enabledForAccount,
    });
  const { data: totalDAIBorrows, refetch: refetchTotalDaiBorrows } =
    useReadContract({
      ...aave,
      functionName: "totalDAIBorrows",
      args: address ? [address] : undefined,
      ...enabledForAccount,
    });
  const { data: daiPrice, refetch: refetchDaiPrice } = useReadContract({
    ...aave,
    functionName: "daiPriceUSD",
  });
  const { data: maxSafeBorrow, refetch: refetchMaxSafeBorrow } = useReadContract({
    ...aave,
    functionName: "maxSafeBorrowDAI",
  });

  // --- write ---
  const { data: hash, isPending, error, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });
  const loading = isPending || isConfirming;

  useEffect(() => {
    if (!isConfirmed) return;

    void Promise.all([
      refetchEthBalance(),
      refetchDaiBalance(),
      refetchAWethBalance(),
      refetchTotalEthDeposits(),
      refetchTotalDaiBorrows(),
      refetchDaiPrice(),
      refetchMaxSafeBorrow(),
    ]);
  }, [
    isConfirmed,
    refetchEthBalance,
    refetchDaiBalance,
    refetchAWethBalance,
    refetchTotalEthDeposits,
    refetchTotalDaiBorrows,
    refetchDaiPrice,
    refetchMaxSafeBorrow,
  ]);

  // --- input validation ---
  const isDecimal = (s: string) =>
    /^\d*\.?\d*$/.test(s) && s !== "" && s !== ".";
  const ethValid = isDecimal(ethInput) && Number(ethInput) > 0;
  const daiTrimmed = daiInput.trim();
  const daiValid = daiTrimmed === "" || isDecimal(daiTrimmed);
  const canSubmit = ethValid && daiValid && !loading;

  const onDepositBorrow = () => {
    if (!ethValid || !daiValid) return;
    // The requested DAI is validated on-chain against maxSafeBorrowDAI; no
    // browser-side float borrow math any more (see contracts/AaveDeFi.sol).
    writeContract({
      ...aave,
      functionName: "depositETHAndBorrowDAI",
      args: [parseUnits(daiTrimmed || "0", 18)],
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
          <p className="mt-10 text-gray-600">
            Connect your wallet to get started.
          </p>
        ) : (
          <>
            <div className="mx-auto mt-8 flex max-w-md flex-col gap-4 rounded-lg bg-white p-6 shadow">
              <div className="flex flex-col gap-1">
                <label className="flex items-center justify-between gap-3">
                  <span>ETH to deposit</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={ethInput}
                    placeholder="1.0"
                    onChange={(e) => setEthInput(e.target.value)}
                    aria-invalid={ethInput !== "" && !ethValid}
                    className={inputClass}
                  />
                </label>
                {ethInput !== "" && !ethValid && (
                  <span className="text-right text-xs text-red-600">
                    Enter a positive number.
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="flex items-center justify-between gap-3">
                  <span>DAI to borrow</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={daiInput}
                    placeholder="0"
                    onChange={(e) => setDaiInput(e.target.value)}
                    aria-invalid={!daiValid}
                    className={inputClass}
                  />
                </label>
                {!daiValid && (
                  <span className="text-right text-xs text-red-600">
                    Enter a valid amount (or 0).
                  </span>
                )}
              </div>
              <button
                onClick={onDepositBorrow}
                disabled={!canSubmit}
                className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Processing…" : "Deposit & Borrow"}
              </button>
              <p className="text-sm text-gray-500">
                Max safe DAI borrow (on-chain): {dai(maxSafeBorrow)}
              </p>
              {error && (
                <p className="text-sm text-red-600">
                  {(error as { shortMessage?: string }).shortMessage ??
                    error.message}
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
              <h2 className="mb-3 text-lg font-medium">
                Your totals on the AaveDeFi contract
              </h2>
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
                      <td className={tdClass}>
                        {daiPrice ? formatUnits(daiPrice, 8) : "0"}
                      </td>
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
