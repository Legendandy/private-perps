# Stealth Perps — Private Perpetuals on Solana × Arcium

> Fully encrypted perpetual futures trading. Positions, orders, and liquidation logic run inside Arcium's MPC network. Only final PnL is ever revealed, and only to the trader.

---

## Table of Contents

1. [How Arcium Is Used](#how-arcium-is-used)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites](#prerequisites)
4. [Step-by-Step Setup](#step-by-step-setup)
5. [Project Structure](#project-structure)
6. [Running Locally](#running-locally)
7. [Deploying to Devnet](#deploying-to-devnet)
8. [Privacy Guarantees](#privacy-guarantees)

---

## How Arcium Is Used

Traditional on-chain perpetual DEXes expose everything: position sizes, entry prices, leverage, and liquidation thresholds are all public on-chain data. This enables:

- **Copy-trading** — bots shadow large traders in real time.
- **Targeted liquidations** — MEV bots push prices to exact liquidation levels.
- **Front-running** — large orders are detected before execution.

**Stealth Perps** solves this by routing all sensitive computations through Arcium's decentralized Multi-Party Computation (MPC) network:

| Operation | What Arcium Does |
|---|---|
| `open_position` | Encrypts size, leverage, entry price before storing on-chain |
| `check_liquidation` | Computes whether mark_price < liq_price entirely in MPC — never reveals either value publicly |
| `close_position` | Calculates PnL in MPC; only the **signed result** is emitted on-chain |
| `update_funding` | Funding rate applied to encrypted notional values |

The `#[encrypted]` circuits in `encrypted-ixs/src/lib.rs` are compiled into ZK-ready MPC circuits that run across Arcium nodes. No single node (or observer) sees plaintext position data.

**Only the trader** (holding the x25519 private key used to encrypt inputs) can decrypt the returned ciphertext via the `RescueCipher` shared secret.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / App                         │
│  React + Wallet Adapter                                      │
│  • Encrypts position data with x25519 + RescueCipher        │
│  • Calls Solana program instructions                         │
└──────────────────────┬──────────────────────────────────────┘
                       │ Solana Transactions
┌──────────────────────▼──────────────────────────────────────┐
│              stealth-perps Anchor Program                    │
│  • Stores encrypted position accounts                        │
│  • Queues MPC computations via queue_computation()           │
│  • Receives callbacks from Arcium with encrypted results     │
└──────────┬───────────────────────────────┬──────────────────┘
           │ queue_computation             │ arcium_callback
┌──────────▼──────────────────────┐       │
│     Arcium MPC Network           │       │
│  • Runs encrypted-ixs circuits   │       │
│  • check_liquidation_circuit     │       │
│  • calculate_pnl_circuit         │       │
│  • apply_funding_circuit         │       │
│  Returns SignedComputationOutputs│───────┘
└──────────────────────────────────┘
```

---

## Prerequisites

```bash
# 1. Rust (stable)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Solana CLI (1.18+)
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"

# 3. Anchor CLI (via avm)
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest && avm use latest

# 4. Arcium CLI (wraps anchor)
# Follow: https://docs.arcium.com/developers/installation
cargo install arcium-cli

# 5. Node.js 18+ and yarn
npm install -g yarn

# 6. Solana keypair (devnet)
solana-keygen new --outfile ~/.config/solana/id.json
solana config set --url devnet
solana airdrop 4
```

---

## Step-by-Step Setup

### Step 1 — Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/stealth-perps
cd stealth-perps
yarn install
```

### Step 2 — Build MPC Circuits (encrypted-ixs)

The Arcis framework compiles Rust circuits into MPC-executable bytecode.

```bash
arcium build
```

This:
- Compiles `encrypted-ixs/src/lib.rs` into circuit artifacts
- Compiles the Anchor program in `programs/stealth-perps/src/lib.rs`
- Generates TypeScript IDL at `target/idl/stealth_perps.json`

### Step 3 — Run Tests (local cluster)

```bash
arcium test
```

Tests spin up a local validator with Arcium's devnet MPC cluster mocked. They verify:
- Position encryption / decryption round-trip
- Liquidation check correctness (private inputs, boolean output)
- PnL calculation accuracy

### Step 4 — Start the Frontend

```bash
cd app
yarn dev
# Opens at http://localhost:5173
```

### Step 5 — Deploy to Devnet

```bash
# Initialize computation definitions (once per deployment)
arcium deploy --cluster devnet

# The CLI will output your program ID — update Arcium.toml and app/src/lib/constants.ts
```

---

## Project Structure

```
stealth-perps/
├── Arcium.toml                    # Arcium + Anchor config
├── Anchor.toml                    # Anchor workspace config
├── programs/
│   └── stealth-perps/
│       └── src/
│           └── lib.rs             # Solana program (Anchor + Arcium)
├── encrypted-ixs/
│   └── src/
│       └── lib.rs                 # Arcis MPC circuits (run in Arcium network)
├── app/
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── lib/
│       │   ├── constants.ts       # Program IDs, cluster config
│       │   ├── arcium.ts          # Arcium client helpers
│       │   └── encryption.ts     # x25519 + RescueCipher utils
│       ├── hooks/
│       │   ├── usePositions.ts
│       │   └── useArciumCompute.ts
│       ├── components/
│       │   ├── Layout.tsx
│       │   ├── MarketList.tsx
│       │   ├── TradingPanel.tsx
│       │   ├── OrderBook.tsx      # Shows obfuscated depth
│       │   ├── PositionTable.tsx
│       │   ├── EncryptionStatus.tsx
│       │   └── PnlReveal.tsx
│       └── pages/
│           ├── HomePage.tsx
│           └── TradingPage.tsx
├── tests/
│   └── stealth-perps.ts           # Mocha integration tests
└── README.md
```

---

## Privacy Guarantees

| Data | Visibility |
|---|---|
| Position size | 🔒 Encrypted — only trader |
| Entry price | 🔒 Encrypted — only trader |
| Leverage | 🔒 Encrypted — only trader |
| Liquidation price | 🔒 Computed in MPC, never stored plaintext |
| Unrealized PnL | 🔒 Encrypted result, blur-revealed in UI |
| Funding payment | 🔒 Applied in MPC |
| Final realized PnL | ✅ Emitted on-chain after close (trader's choice) |
| Is liquidatable (bool) | ✅ Emitted by MPC (boolean only, no prices exposed) |

Arcium's MPC cluster requires a threshold of nodes to collude to reconstruct any plaintext. On mainnet-alpha, this uses production-grade threshold MPC with cryptographic proofs.
