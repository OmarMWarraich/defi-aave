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
import "./App.css";

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

  return (
    <div>
      <nav className="navbar navbar-dark fixed-top bg-dark flex-md-nowrap p-0 shadow justify-content-between px-3">
        <span className="navbar-brand mr-0">Aave DeFi</span>
        <ConnectButton />
      </nav>
      <div className="container-fluid mt-5">
        <div className="row">
          <main role="main" className="col-lg-12 d-flex text-center">
            <div className="content mt-5 mr-auto ml-auto">
              <h1>Aave DeFi DApp</h1>
              <p>Deposit ETH as collateral on Aave v3 and borrow DAI against it.</p>

              {!isConnected ? (
                <p className="mt-5">Connect your wallet to get started.</p>
              ) : (
                <>
                  <div className="mt-4">
                    <div className="form-group">
                      <label>
                        ETH to deposit:&nbsp;
                        <input
                          type="text"
                          inputMode="decimal"
                          value={ethInput}
                          placeholder="1.0"
                          onChange={(e) => setEthInput(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="form-group">
                      <label>
                        DAI to borrow:&nbsp;
                        <input
                          type="text"
                          inputMode="decimal"
                          value={daiInput}
                          placeholder="0"
                          onChange={(e) => setDaiInput(e.target.value)}
                        />
                      </label>
                    </div>
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={onDepositBorrow}
                      disabled={loading || !ethInput}
                    >
                      {loading ? "Processing…" : "Deposit & Borrow"}
                    </button>
                    <p className="mt-2">
                      <small>
                        Max safe DAI borrow (on-chain): {dai(maxSafeBorrow)}
                      </small>
                    </p>
                    {error && (
                      <p className="text-danger mt-2">
                        <small>{(error as { shortMessage?: string }).shortMessage ?? error.message}</small>
                      </p>
                    )}
                  </div>

                  <p className="mt-5">Wallet balances</p>
                  <div className="row justify-content-center">
                    <div className="col-auto">
                      <table className="table table-responsive m-auto">
                        <thead>
                          <tr>
                            <th scope="col">ETH Balance</th>
                            <th scope="col">DAI Balance</th>
                            <th scope="col">aWETH (AaveDeFi contract)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{ethBalance ? formatEther(ethBalance.value) : "0"}</td>
                            <td>{dai(daiBalance)}</td>
                            <td>{dai(aWethBalance)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <hr />
                  <p className="mt-5">Your totals on the AaveDeFi contract</p>
                  <div className="row justify-content-center">
                    <div className="col-auto">
                      <table className="table table-responsive m-auto">
                        <thead>
                          <tr>
                            <th scope="col">Total ETH Deposits</th>
                            <th scope="col">Total DAI Borrows</th>
                            <th scope="col">DAI price (USD)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{totalETHDeposits ? formatEther(totalETHDeposits) : "0"}</td>
                            <td>{dai(totalDAIBorrows)}</td>
                            <td>
                              {daiPrice ? formatUnits(daiPrice, 8) : "0"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
