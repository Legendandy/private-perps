/**
 * encryption.ts
 *
 * Client-side encryption helpers for Stealth Perps.
 * Uses x25519 key exchange + Arcium's RescueCipher (Rescue-Prime based).
 *
 * IMPORTANT: The private key NEVER leaves the browser.
 * The shared secret is derived from: x25519(client_sk, mxe_pk)
 * Only the trader holding client_sk can decrypt the results.
 */

import * as x25519 from "@stablelib/x25519";

// RescueCipher is provided by @arcium-hq/client
// We re-export a friendly wrapper here.

export interface EncryptionContext {
  publicKey: Uint8Array;    // Send to program (stored for decryption reference)
  privateKey: Uint8Array;   // NEVER sent anywhere — kept in memory
  sharedSecret: Uint8Array; // Derived with MXE pubkey — used for cipher
}

/** Generate a fresh ephemeral keypair for this session/position */
export function generateEphemeralKeypair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/** Derive shared secret between client private key and MXE public key */
export function deriveSharedSecret(
  clientPrivateKey: Uint8Array,
  mxePublicKey: Uint8Array
): Uint8Array {
  return x25519.getSharedSecret(clientPrivateKey, mxePublicKey);
}

/** Convert a u64 value to a 32-byte ciphertext array placeholder for UI previews */
export function mockEncrypt(value: bigint): Uint8Array {
  const buf = new Uint8Array(32);
  // In production, this is done by RescueCipher.encrypt()
  // For UI preview without a live connection, we fill with pseudo-random bytes
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, value, true);
  // Fill the rest with deterministic noise
  for (let i = 8; i < 32; i++) {
    buf[i] = (Number(value ^ BigInt(i * 31)) & 0xff);
  }
  return buf;
}

/** Format a ciphertext blob for display (first 8 bytes as hex) */
export function formatCiphertext(ct: Uint8Array): string {
  return "0x" + Array.from(ct.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("") + "...";
}

/** Format a price scaled by SCALE (1_000_000) for display */
export function formatScaledPrice(scaled: bigint): string {
  const whole = scaled / 1_000_000n;
  const frac = scaled % 1_000_000n;
  return `$${whole.toLocaleString()}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
}

/** Parse a dollar string like "142.50" into scaled bigint */
export function parsePrice(s: string): bigint {
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(fracPadded);
}

/**
 * Simulate what the RescueCipher would produce.
 * In a real integration, import RescueCipher from @arcium-hq/client
 * and call: cipher.encrypt(plaintexts, nonce)
 */
export interface PositionCiphertexts {
  ct_collateral: number[];
  ct_size: number[];
  ct_entry_price: number[];
  ct_leverage_bps: number[];
  ct_is_long: number[];
  pub_key: number[];
  nonce: number;
}

export function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  return nonce;
}

export function u128FromBytes(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < 16; i++) {
    result |= BigInt(bytes[i]) << (BigInt(i) * 8n);
  }
  return result;
}
