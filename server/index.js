/**
 * server/index.js
 *
 * Express backend for Stealth Perps.
 * Mirrors the pattern from veil-markets/arcium-auction.
 *
 * Why a backend?
 *   - Fetching the MXE public key requires a server-side Solana connection
 *     with a funded wallet (no CORS, reliable RPC).
 *   - The frontend calls /api/arcium/mxe-public-key to get the x25519 key
 *     it needs for encryption before sending a transaction.
 *   - /api/arcium/await-computation polls until the MPC finishes.
 *   - /api/arcium/decrypt-result helps the UI decrypt PnL / liq price results.
 */

const express = require("express");
const cors = require("cors");
const { Connection, PublicKey } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const {
  getMXEPublicKeyWithRetry,
  getMXEAccAddress,
  awaitComputationFinalization,
  getArciumEnv,
  RescueCipher,
  deserializeLE,
} = require("@arcium-hq/client");
const x25519 = require("@stablelib/x25519");

const app = express();
app.use(express.json());

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(new Error("Not allowed by CORS"));
    },
  })
);

// ─── Config ──────────────────────────────────────────────────────────────────
const RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = process.env.PROGRAM_ID || "57dAxRF57a33kHwa51Xhd4eNjLg7vc7Q1phfMKS4xtfy";
const CLUSTER_OFFSET = parseInt(process.env.CLUSTER_OFFSET || "456", 10);

// Build a read-only provider (no wallet needed for fetching MXE key)
const connection = new Connection(RPC_URL, "confirmed");

/**
 * GET /api/arcium/mxe-public-key
 *
 * Returns the Arcium MXE x25519 public key (base64).
 * The frontend uses this to derive a shared secret for encrypting position data.
 *
 * In the arcium-hq/client SDK, getMXEPublicKeyWithRetry fetches the MXE account
 * from Solana and extracts the x25519 public key stored there.
 */
app.get("/api/arcium/mxe-public-key", async (req, res) => {
  try {
    const programId = new PublicKey(PROGRAM_ID);

    // Build minimal anchor provider (no wallet — read-only)
    const provider = new anchor.AnchorProvider(
      connection,
      {
        publicKey: PublicKey.default,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      },
      { commitment: "confirmed" }
    );

    const mxePubKey = await getMXEPublicKeyWithRetry(provider, programId);

    res.json({
      publicKey: Buffer.from(mxePubKey).toString("base64"),
      hex: Buffer.from(mxePubKey).toString("hex"),
    });
  } catch (err) {
    console.error("[mxe-public-key] error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/arcium/await-computation
 *
 * Body: { computationOffset: string (decimal), programId?: string }
 *
 * Polls Arcium for the given computation to finalize.
 * Returns { finalized: true, signature } on success.
 *
 * Called from the frontend after submitting a transaction that queues a
 * computation (open_position, check_liquidation, close_position).
 */
app.post("/api/arcium/await-computation", async (req, res) => {
  try {
    const { computationOffset, programId: reqProgramId } = req.body;
    if (!computationOffset)
      return res.status(400).json({ error: "computationOffset required" });

    const programId = new PublicKey(reqProgramId || PROGRAM_ID);
    const offset = new anchor.BN(computationOffset);

    const provider = new anchor.AnchorProvider(
      connection,
      {
        publicKey: PublicKey.default,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      },
      { commitment: "confirmed" }
    );

    const sig = await awaitComputationFinalization(
      provider,
      offset,
      programId,
      "confirmed"
    );

    res.json({ finalized: true, signature: sig });
  } catch (err) {
    console.error("[await-computation] error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/arcium/decrypt-result
 *
 * Body:
 *   {
 *     ciphertext: base64,   // 32-byte output ciphertext from callback event
 *     nonce: string,        // u128 as decimal string
 *     sharedSecret: base64  // 32-byte x25519 shared secret (client-derived)
 *   }
 *
 * Returns { value: string } — the decrypted u64 as a decimal string.
 *
 * NOTE: In production, you may want to keep the shared secret client-side only
 * and do decryption in the browser (to avoid leaking the secret to the server).
 * This endpoint exists for convenience / debugging; the frontend can also
 * decrypt directly using RescueCipher from @arcium-hq/client.
 */
app.post("/api/arcium/decrypt-result", async (req, res) => {
  try {
    const { ciphertext, nonce, sharedSecret } = req.body;
    if (!ciphertext || !nonce || !sharedSecret)
      return res.status(400).json({ error: "ciphertext, nonce, sharedSecret required" });

    const ctBuf = Buffer.from(ciphertext, "base64");
    const secretBuf = Buffer.from(sharedSecret, "base64");
    const nonceBuf = Buffer.alloc(16);
    const nonceBn = BigInt(nonce);
    // Write nonce as little-endian u128 into 16 bytes
    let tmp = nonceBn;
    for (let i = 0; i < 16; i++) {
      nonceBuf[i] = Number(tmp & 0xffn);
      tmp >>= 8n;
    }

    const cipher = new RescueCipher(secretBuf);
    const decrypted = cipher.decrypt([new Uint8Array(ctBuf)], nonceBuf);
    const value = decrypted[0].toString();

    res.json({ value });
  } catch (err) {
    console.error("[decrypt-result] error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /health
 */
app.get("/health", (_req, res) => {
  res.json({ ok: true, program: PROGRAM_ID, rpc: RPC_URL });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🔐 Stealth Perps backend listening on port ${PORT}`);
  console.log(`   RPC:     ${RPC_URL}`);
  console.log(`   Program: ${PROGRAM_ID}`);
});
