import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.ANCHOR_BROWSER": "true",
    global: "globalThis",
  },
  resolve: {
    alias: {
      stream: "stream-browserify",
      buffer: "buffer",
      "@arcium-hq/client": "/src/lib/arcium-stub.ts",
    },
  },
  optimizeDeps: {
    include: ["buffer", "@coral-xyz/anchor", "@solana/web3.js"],
    esbuildOptions: {
      target: "es2020",
    },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      external: [],
    },
  },
});