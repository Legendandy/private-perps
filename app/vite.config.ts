import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.ANCHOR_BROWSER": "true",
    global: "globalThis",
  },
  resolve: {
    alias: [
      // Only stub the specific Node-only named exports, NOT the whole package.
      // We use a virtual module approach: anything imported as a bare
      // "@arcium-hq/client" specifier goes through our stub ONLY for the
      // symbols that break in browsers.  The PDA helpers
      // (getMXEAccAddress, getMempoolAccAddress, etc.) are pure
      // @solana/web3.js and work fine in the browser — so we let Vite
      // resolve them from the real package.
      {
        find: /^@arcium-hq\/client\/stub$/,
        replacement: path.resolve(__dirname, "src/lib/arcium-stub.ts"),
      },
    ],
  },
  optimizeDeps: {
    include: ["buffer", "@coral-xyz/anchor", "@solana/web3.js"],
    esbuildOptions: {
      target: "es2020",
    },
  },
  build: {
    target: "es2020",
  },
});