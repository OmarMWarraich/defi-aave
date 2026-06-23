import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // TRANSITIONAL: web3.js 1.x needs Node globals (Buffer/process/stream) that
    // Vite does not polyfill by default. Remove this plugin once the frontend
    // migrates from web3.js to viem/wagmi (later Phase 4 task).
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
  ],
  server: { port: 3000 },
  build: { outDir: "dist" },
});
