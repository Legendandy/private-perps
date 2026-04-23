import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env": {},
    global: "globalThis",
  },
  resolve: {
    alias: {
      stream: "stream-browserify",
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    include: ["@solana/web3.js", "bn.js", "buffer"],
  },
   server: {
    host: "0.0.0.0",
    allowedHosts: ["5173--019db6dc-b10b-7b62-ac33-6ace86cfbfc8.eu-central-1-01.gitpod.dev"],
  },
});
