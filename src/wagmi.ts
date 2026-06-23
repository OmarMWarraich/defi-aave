import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, hardhat } from "wagmi/chains";

// WalletConnect Cloud project id (https://cloud.walletconnect.com).
// Falls back to a placeholder so the app builds; WalletConnect-based wallets
// won't work until a real id is set in .env.
const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "PLACEHOLDER_PROJECT_ID";

export const config = getDefaultConfig({
  appName: "Aave DeFi DApp",
  projectId,
  chains: [mainnet, hardhat],
  ssr: false,
});
