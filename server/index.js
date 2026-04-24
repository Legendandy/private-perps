const express = require("express");
const cors = require("cors");
const { Connection, PublicKey } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const {
  getMXEPublicKey,
  awaitComputationFinalization,
  RescueCipher,
  deserializeLE,
} = require("@arcium-hq/client");
const x25519lib = require("@stablelib/x25519");
const crypto = require("crypto");

const app = express();
app.use(express.json());

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

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = process.env.PROGRAM_ID || "57dAxRF57a33kHwa51Xhd4eNjLg7vc7Q1phfMKS4xtfy";

const connection = new Connection(RPC_URL, "confirmed");

function makeReadOnlyProvider() {
  return new anchor.AnchorProvider(
    connection,
    {
      publicKey: PublicKey.default,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    },
    { commitment: "confirmed" }
  );
}

// ─── Cache MXE public key ─────────────────────────────────────────────────────

let cachedMxePubKey = null;

async function getMxePubKeyCached() {
  if (cachedMxePubKey) return cachedMxePubKey;
  const programId = new PublicKey(PROGRAM_ID);
  cachedMxePubKey = await getMXEPublicKey(makeReadOnlyProvider(), programId);
  console.log("MXE public key cached:", Buffer.from(cachedMxePubKey).toString("hex"));
  return cachedMxePubKey;
}

getMxePubKeyCached().catch((err) => console.error("Failed to pre-fetch MXE key:", err));

// ─── GET /api/arcium/mxe-public-key ──────────────────────────────────────────

app.get("/api/arcium/mxe-public-key", async (req, res) => {
  try {
    const mxePubKey = await getMxePubKeyCached();
    res.json({
      publicKey: Buffer.from(mxePubKey).toString("base64"),
      hex: Buffer.from(mxePubKey).toString("hex"),
    });
  } catch (err) {
    console.error("[mxe-public-key]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/arcium/encrypt-position ───────────────────────────────────────

app.post("/api/arcium/encrypt-position", async (req, res) => {
  try {
    const { values } = req.body;
    if (!values || values.length !== 5)
      return res.status(400).json({ error: "values must be array of 5 strings" });

    const mxePubKey = await getMxePubKeyCached();

    const keyPair = x25519lib.generateKeyPair();
    const publicKey = keyPair.publicKey;
    const secret = x25519lib.sharedKey(keyPair.secretKey, mxePubKey);

    const cipher = new RescueCipher(secret);
    const nonce = crypto.randomBytes(16);
    const bigintValues = values.map((v) => BigInt(v));
    const cts = cipher.encrypt(bigintValues, nonce);

    res.json({
      ct_collateral:   Array.from(cts[0]),
      ct_size:         Array.from(cts[1]),
      ct_entry_price:  Array.from(cts[2]),
      ct_leverage_bps: Array.from(cts[3]),
      ct_is_long:      Array.from(cts[4]),
      pub_key:         Array.from(publicKey),
      nonce:           deserializeLE(nonce).toString(),
    });
  } catch (err) {
    console.error("[encrypt-position]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/arcium/encrypt-close ──────────────────────────────────────────

app.post("/api/arcium/encrypt-close", async (req, res) => {
  try {
    const { values } = req.body;
    if (!values || values.length !== 2)
      return res.status(400).json({ error: "values must be array of 2 strings" });

    const mxePubKey = await getMxePubKeyCached();

    const keyPair = x25519lib.generateKeyPair();
    const publicKey = keyPair.publicKey;
    const secret = x25519lib.sharedKey(keyPair.secretKey, mxePubKey);

    const cipher = new RescueCipher(secret);
    const nonce = crypto.randomBytes(16);
    const bigintValues = values.map((v) => BigInt(v));
    const cts = cipher.encrypt(bigintValues, nonce);

    res.json({
      ct_exit_price:   Array.from(cts[0]),
      ct_funding_owed: Array.from(cts[1]),
      pub_key:         Array.from(publicKey),
      nonce:           deserializeLE(nonce).toString(),
    });
  } catch (err) {
    console.error("[encrypt-close]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/arcium/decrypt-result ─────────────────────────────────────────

app.post("/api/arcium/decrypt-result", async (req, res) => {
  try {
    const { ciphertext, nonce, sharedSecret } = req.body;
    if (!ciphertext || !nonce || !sharedSecret)
      return res.status(400).json({ error: "ciphertext, nonce, sharedSecret required" });

    const ctBuf = Buffer.from(ciphertext, "base64");
    const secretBuf = Buffer.from(sharedSecret, "base64");
    const nonceBuf = Buffer.alloc(16);
    let tmp = BigInt(nonce);
    for (let i = 0; i < 16; i++) {
      nonceBuf[i] = Number(tmp & 0xffn);
      tmp >>= 8n;
    }

    const cipher = new RescueCipher(secretBuf);
    const decrypted = cipher.decrypt([new Uint8Array(ctBuf)], nonceBuf);
    res.json({ value: decrypted[0].toString() });
  } catch (err) {
    console.error("[decrypt-result]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/arcium/await-computation ──────────────────────────────────────

app.post("/api/arcium/await-computation", async (req, res) => {
  try {
    const { computationOffset, programId: reqProgramId } = req.body;
    if (!computationOffset)
      return res.status(400).json({ error: "computationOffset required" });

    const programId = new PublicKey(reqProgramId || PROGRAM_ID);
    const offset = new anchor.BN(computationOffset);

    const sig = await awaitComputationFinalization(
      makeReadOnlyProvider(),
      offset,
      programId,
      "confirmed"
    );

    res.json({ finalized: true, signature: sig });
  } catch (err) {
    console.error("[await-computation]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /health ──────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true, program: PROGRAM_ID, rpc: RPC_URL });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🔐 Stealth Perps backend listening on port ${PORT}`);
  console.log(`   RPC:     ${RPC_URL}`);
  console.log(`   Program: ${PROGRAM_ID}`);
});