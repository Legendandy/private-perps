/**
 * app/src/lib/arcium.ts
 *
 * REAL Arcium integration — no simulation, no mocks.
 *
 * Architecture:
 *   1. Frontend calls /api/arcium/mxe-public-key to get the MXE x25519 key
 *   2. Frontend derives shared secret: x25519(ourPrivKey, mxePubKey)
 *   3. Frontend encrypts position fields with RescueCipher(sharedSecret)
 *   4. Frontend submits Solana transaction (queues Arcium computation)
 *   5. Frontend calls /api/arcium/await-computation to wait for MPC result
 *   6. Frontend decrypts result client-side with RescueCipher
 *
 * The private key NEVER leaves the browser.
 * The server only holds the MXE public key (which is already on-chain / public).
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { RescueCipher, deserializeLE } from "@arcium-hq/client";
import * as x25519 from "@stablelib/x25519";
import { BACKEND_API_BASE, PROGRAM_ID, RPC_URL } from "./constants";

export type ComputationStatus =
  | "idle"
  | "encrypting"
  | "queuing"
  | "mpc_computing"
  | "awaiting_callback"
  | "done"
  | "error";

export function statusLabel(s: ComputationStatus): string {
  const labels: Record<ComputationStatus, string> = {
    idle: "Ready",
    encrypting: "Encrypting inputs…",
    queuing: "Queuing to Arcium…",
    mpc_computing: "MPC nodes computing…",
    awaiting_callback: "Awaiting on-chain callback…",
    done: "Computation complete ✓",
    error: "Error",
  };
  return labels[s];
}

export function statusColor(s: ComputationStatus): string {
  if (s === "done") return "text-[#22d3a5]";
  if (s === "error") return "text-red-400";
  if (s === "idle") return "text-zinc-500";
  return "text-[#22d3a5]";
}

// ─── Session Encryption Context ──────────────────────────────────────────────

export interface EncryptionContext {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  cipher: InstanceType<typeof RescueCipher>;
  sharedSecretB64: string; // For server-side decryption (optional)
}

let _encryptionCtx: EncryptionContext | null = null;

/**
 * Build (or return cached) encryption context for this session.
 * Fetches the MXE public key from the backend API, derives shared secret.
 */
export async function getEncryptionContext(): Promise<EncryptionContext> {
  if (_encryptionCtx) return _encryptionCtx;

  // 1. Generate ephemeral x25519 keypair (stays in browser memory only)
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);

  // 2. Fetch the MXE public key from backend
  const resp = await fetch(`${BACKEND_API_BASE}/api/arcium/mxe-public-key`);
  if (!resp.ok) throw new Error(`Failed to fetch MXE pubkey: ${resp.statusText}`);
  const { publicKey: mxePubKeyB64 } = await resp.json();
  const mxePublicKey = new Uint8Array(Buffer.from(mxePubKeyB64, "base64"));

  // 3. Derive shared secret
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);

  _encryptionCtx = {
    privateKey,
    publicKey,
    cipher,
    sharedSecretB64: Buffer.from(sharedSecret).toString("base64"),
  };

  return _encryptionCtx;
}

/**
 * Clear the cached context (e.g. on wallet disconnect).
 */
export function clearEncryptionContext() {
  _encryptionCtx = null;
}

// ─── Encryption Helpers ───────────────────────────────────────────────────────

export interface PositionEncrypted {
  ct_collateral: number[];
  ct_size: number[];
  ct_entry_price: number[];
  ct_leverage_bps: number[];
  ct_is_long: number[];
  pub_key: number[];
  nonce: anchor.BN;
}

/**
 * Encrypt all position fields using RescueCipher.
 * Returns typed arrays ready to pass to the Anchor program method.
 */
export async function encryptPositionInputs(
  collateralUsdc: bigint,    // × 1_000_000
  size: bigint,
  entryPrice: bigint,
  leverageBps: bigint,
  isLong: bigint
): Promise<PositionEncrypted> {
  const ctx = await getEncryptionContext();
  const { cipher, publicKey } = ctx;

  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const cts = cipher.encrypt(
    [collateralUsdc, size, entryPrice, leverageBps, isLong],
    nonce
  );

  return {
    ct_collateral:  Array.from(cts[0]),
    ct_size:        Array.from(cts[1]),
    ct_entry_price: Array.from(cts[2]),
    ct_leverage_bps:Array.from(cts[3]),
    ct_is_long:     Array.from(cts[4]),
    pub_key:        Array.from(publicKey),
    nonce:          new anchor.BN(deserializeLE(nonce).toString()),
  };
}

export interface PnlEncrypted {
  ct_exit_price: number[];
  ct_funding_owed: number[];
  pub_key: number[];
  nonce: anchor.BN;
}

export async function encryptCloseInputs(
  exitPrice: bigint,
  fundingOwed: bigint
): Promise<PnlEncrypted> {
  const ctx = await getEncryptionContext();
  const { cipher, publicKey } = ctx;

  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const cts = cipher.encrypt([exitPrice, fundingOwed], nonce);

  return {
    ct_exit_price:   Array.from(cts[0]),
    ct_funding_owed: Array.from(cts[1]),
    pub_key:         Array.from(publicKey),
    nonce:           new anchor.BN(deserializeLE(nonce).toString()),
  };
}

// ─── Decryption Helpers ───────────────────────────────────────────────────────

/**
 * Decrypt a single-value result from an Arcium callback event.
 * @param ciphertextArray  32-element number[] from the event
 * @param nonceValue       u128 nonce from the event (as BN / number)
 */
export async function decryptResult(
  ciphertextArray: number[],
  nonceValue: anchor.BN | number
): Promise<bigint> {
  const ctx = await getEncryptionContext();
  const { cipher } = ctx;

  // Re-encode nonce as 16-byte LE Uint8Array
  const nonceBuf = new Uint8Array(16);
  let n = BigInt(nonceValue.toString());
  for (let i = 0; i < 16; i++) {
    nonceBuf[i] = Number(n & 0xffn);
    n >>= 8n;
  }

  const decrypted = cipher.decrypt(
    [new Uint8Array(ciphertextArray)],
    nonceBuf
  );
  return decrypted[0];
}

// ─── Computation Finalization ─────────────────────────────────────────────────

/**
 * Wait for an Arcium computation to finalize via the backend API.
 * @param computationOffset BN — the offset used when queueing the computation
 * @param onStatus          Callback for UI status updates
 */
export async function waitForComputation(
  computationOffset: anchor.BN,
  onStatus?: (s: ComputationStatus) => void
): Promise<void> {
  onStatus?.("mpc_computing");

  const resp = await fetch(`${BACKEND_API_BASE}/api/arcium/await-computation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      computationOffset: computationOffset.toString(),
      programId: PROGRAM_ID,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(`Computation failed: ${err.error}`);
  }

  onStatus?.("awaiting_callback");
  // Backend awaits finalization including callback; when it returns, callback is done
  onStatus?.("done");
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/** Format a ciphertext for display (abbreviated hex) */
export function formatCiphertext(ct: number[]): string {
  return "0x" + ct.slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("") + "…";
}

/** Format a scaled price (× 1_000_000) as a dollar string */
export function formatScaledPrice(scaled: bigint): string {
  const whole = scaled / 1_000_000n;
  const frac  = scaled % 1_000_000n;
  return `$${whole.toLocaleString()}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
}

/** Parse "142.50" → 142_500_000n */
export function parsePrice(s: string): bigint {
  const [whole = "0", frac = ""] = s.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(fracPadded);
}

/** Generate random computation offset (u64 as BN) */
export function randomComputationOffset(): anchor.BN {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result |= BigInt(bytes[i]) << (BigInt(i) * 8n);
  }
  return new anchor.BN(result.toString());
}
