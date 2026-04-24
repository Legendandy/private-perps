import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
  allowedHosts: [
    "5173--019db6dc-b10b-7b62-ac33-6ace86cfbfc8.eu-central-1-01.gitpod.dev"
  ]
},
  define: {
    "process.env.ANCHOR_BROWSER": "true",
    global: "globalThis",
  },
  resolve: {
    alias: {
      stream: "stream-browserify",
      buffer: "buffer",
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



