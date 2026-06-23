import { useCallback, useEffect, useRef, useState } from "react";
import Web3 from "web3";
import AaveDeFi from "../abis/AaveDeFi.json";
import "./App.css";

const fromWei = (str) => (+str / 10 ** 18).toString();
const toWei = (str) => (+str * 10 ** 18).toString();

// Mainnet token addresses used for read-only balance lookups.
const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const AWETH_ADDRESS = "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e";

// Stripped ERC20 mini ABI (balanceOf + decimals).
const miniABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
];

async function connectWeb3() {
  if (window.ethereum) {
    const web3 = new Web3(window.ethereum);
    // NOTE: window.ethereum.enable() is deprecated — the wallet-connection
    // wiring is replaced with wagmi/viem in a later Phase 4 task.
    await window.ethereum.enable();
    return web3;
  }
  if (window.web3) {
    return new Web3(window.web3.currentProvider);
  }
  window.alert("Non-Ethereum browser detected. You should consider trying MetaMask!");
  return null;
}

function App() {
  const [account, setAccount] = useState("");
  const [ethBalance, setEthBalance] = useState("0");
  const [daiBalance, setDaiBalance] = useState("0");
  const [aWETHBalances, setAWETHBalances] = useState("0");
  const [totalETHDeposits, setTotalETHDeposits] = useState("0");
  const [totalDAIBorrows, setTotalDAIBorrows] = useState("0");
  const [daiETHPrice, setDaiETHPrice] = useState("0");
  const [ethInput, setEthInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Web3 connection state that must survive renders without triggering them.
  const web3Ref = useRef(null);
  const aaveDeFiRef = useRef(null);
  const ethDepositRef = useRef("0");

  // Replaces componentWillMount + the chain of load* methods.
  useEffect(() => {
    let cancelled = false;

    const loadBlockchainData = async () => {
      const web3 = await connectWeb3();
      if (!web3 || cancelled) return;
      web3Ref.current = web3;

      const accounts = await web3.eth.getAccounts();
      const acct = accounts[0];
      if (cancelled) return;
      setAccount(acct);

      const networkId = await web3.eth.net.getId();
      const networkData = AaveDeFi.networks[networkId];
      if (!networkData) {
        window.alert("AaveDeFi contract not deployed to detected network.");
        return;
      }
      const aaveDeFi = new web3.eth.Contract(AaveDeFi.abi, networkData.address);
      aaveDeFiRef.current = aaveDeFi;

      const dai = new web3.eth.Contract(miniABI, DAI_ADDRESS);
      const aWeth = new web3.eth.Contract(miniABI, AWETH_ADDRESS);

      const [ethBal, daiBal, aWethBal, tEth, tDai, price] = await Promise.all([
        web3.eth.getBalance(acct),
        dai.methods.balanceOf(acct).call(),
        aWeth.methods.balanceOf(networkData.address).call(),
        aaveDeFi.methods.totalETHDeposits(acct).call(),
        aaveDeFi.methods.totalDAIBorrows(acct).call(),
        aaveDeFi.methods.daiEthprice().call(),
      ]);

      if (cancelled) return;
      setEthBalance(fromWei(ethBal.toString()));
      setDaiBalance(fromWei(daiBal.toString()));
      setAWETHBalances(fromWei(aWethBal.toString()));
      setTotalETHDeposits(fromWei(tEth.toString()));
      setTotalDAIBorrows(fromWei(tDai.toString()));
      setDaiETHPrice(fromWei(price.toString()));
    };

    loadBlockchainData();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback((event) => {
    const value = event.target.value;
    setEthInput(value);
    ethDepositRef.current = toWei(value);
  }, []);

  const borrowDAI = useCallback(async () => {
    const aaveDeFi = aaveDeFiRef.current;
    const web3 = web3Ref.current;
    if (!aaveDeFi || !web3) return;

    const ltv = 0.8; // loan to value ratio for ETH
    const safetyFactor = 0.6; // borrow only a portion of max allowable to avoid liquidations
    const ethAmount = +ethDepositRef.current.toString();
    const maxSafeETHBorrow = ltv * ethAmount;
    const daiEthPriceValue = +daiETHPrice.toString();
    const safeMaxDAIBorrow =
      (maxSafeETHBorrow * safetyFactor) / daiEthPriceValue / 10 ** 18;

    setLoading(true);
    aaveDeFi.methods
      .borrowDAIAgainstETH(new web3.utils.BN(toWei(safeMaxDAIBorrow)))
      .send({ from: account, value: ethDepositRef.current })
      .on("transactionHash", () => {
        setLoading(false);
        window.location.reload();
      });
  }, [account, daiETHPrice]);

  return (
    <div>
      <nav className="navbar navbar-dark fixed-top bg-dark flex-md-nowrap p-0 shadow">
        <a
          className="navbar-brand col-sm-3 col-md-2 mr-0"
          href="http://www.dappuniversity.com/bootcamp"
          target="_blank"
          rel="noopener noreferrer"
        >
          Aave DeFi:
        </a>
        <a
          className="mr-5"
          href={`https://etherscan.io/address/${account}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Account: {account}
        </a>
      </nav>
      <div className="container-fluid mt-5">
        <div className="row">
          <main role="main" className="col-lg-12 d-flex text-center">
            <div className="content mt-5 mr-auto ml-auto">
              <h1>Aave DEFI DAPP</h1>
              <p>Borrow some DAI from Aave by depositing ETH!</p>
              <p>To borrow DAI you have to deposit some collateral in this case, ETH!</p>
              <p>
                When you click the button below, Metamask will prompt you to choose an amount of ETH
                to send before submitting the transaction.
              </p>
              <div>
                <label>
                  Amount ETH Deposit:
                  <input type="text" value={ethInput} onChange={handleChange} />
                </label>
                <button className="mt-5 btn btn-primary btn-lg" onClick={borrowDAI}>
                  Borrow DAI
                </button>
              </div>
              {loading ? (
                <div> Loading....</div>
              ) : (
                <>
                  <p className="mt-5">View WALLET balances below!</p>
                  <div className="row justify-content-center">
                    <div className="col-auto">
                      <table className="table table-responsive m-auto">
                        <thead>
                          <tr>
                            <th scope="col">ETH Balance</th>
                            <th scope="col">DAI Balance</th>
                            <th scope="col">aWETH Balances(*AaveDeFi Contract*)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{ethBalance}</td>
                            <td>{daiBalance}</td>
                            <td>{aWETHBalances}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <hr />
                  <p className="mt-5">
                    View your TOTAL Deposits and TOTAL BORROWS on our AaveDeFi Contract!
                  </p>
                  <div className="row justify-content-center">
                    <div className="col-auto">
                      <table className="table table-responsive m-auto">
                        <thead>
                          <tr>
                            <th scope="col">Total ETH Deposits</th>
                            <th scope="col">Total DAI Borrows</th>
                            <th scope="col">Latest DAI/ETH price used</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{totalETHDeposits}</td>
                            <td>{totalDAIBorrows}</td>
                            <td>
                              <a
                                href="https://www.coingecko.com/en/coins/dai/eth"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {daiETHPrice}
                              </a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
              <br />
              <br />
              <a
                className="App-link"
                href="http://www.dappuniversity.com/bootcamp"
                target="_blank"
                rel="noopener noreferrer"
              >
                LEARN BLOCKCHAIN <u><b>NOW! </b></u>
              </a>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
