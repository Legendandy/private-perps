# 🔐 Stealth Perps — Private Perpetual Trading on Solana

Fully private perpetual futures powered by **Arcium MPC**.
Positions, orders, and liquidations compute privately. Only final PnL is revealed.

## Stack

| Layer | Tech |
|---|---|
| Smart contract | Anchor 0.32 + arcium-anchor macros |
| MPC circuits | Arcis (encrypted-ixs/) |
| Frontend | React + Vite + Tailwind |
| Live prices | Binance WebSocket (8 markets) |
| Backend | Express on Render |
| Storage | Supabase (circuit files) |

## Quick Start (Mock Mode — no wallet needed)

```bash
cd app
npm install
# .env already set to VITE_MOCK_ARCIUM=true
npm run dev
```

Open http://localhost:5173 — live prices stream from Binance WebSocket immediately.

## Live Markets

- BTC/USDC · ETH/USDC · SOL/USDC · BNB/USDC
- AVAX/USDC · LINK/USDC · JUP/USDC · WIF/USDC

Prices via Binance WebSocket (`wss://stream.binance.com:9443`).
Fallback: CoinGecko REST on initial load.

## How Arcium Integration Works

1. **Encrypt**: Browser generates ephemeral x25519 keypair. Position fields encrypted with `RescueCipher(sharedSecret)`.
2. **Submit**: Encrypted blobs stored on-chain via Anchor program. `queue_computation` dispatched to Arcium MPC.
3. **MPC**: Arcium threshold nodes execute the Arcis circuit (open_position, check_liquidation, calculate_pnl). No node sees plaintext.
4. **Callback**: On-chain callback stores encrypted result. Frontend event listener catches it.
5. **Decrypt**: Browser decrypts result client-side using private key. Only the trader sees the number.

## Environment Variables

### app/.env
```
VITE_MOCK_ARCIUM=true          # false for real devnet
VITE_PROGRAM_ID=...            # your deployed program ID
VITE_RPC_URL=https://api.devnet.solana.com
VITE_BACKEND_API_BASE=https://your-api.onrender.com
```

### server/.env
```
PROGRAM_ID=...
SOLANA_RPC_URL=https://api.devnet.solana.com
CLUSTER_OFFSET=456
CORS_ORIGINS=https://your-app.vercel.app
PORT=4000
```

## Full Deployment Guide

See the deployment guide PDF (stealth-perps-guide.docx) for the complete
step-by-step: Gitpod → Supabase → Devnet → Render → Vercel.
