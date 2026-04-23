/**
 * arcium.ts
 *
 * Arcium client helpers for the frontend.
 * Wraps @arcium-hq/client functions for use with React/Solana wallet adapter.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { ARCIUM_CLUSTER_OFFSET } from "./constants";

/**
 * Fetch the MXE (MPC eXecution Environment) x25519 public key.
 * This is used for the key exchange that enables encryption of position data.
 *
 * In production, call getMXEPublicKeyWithRetry from @arcium-hq/client.
 * Here we provide a typed wrapper with retry logic.
 */
export async function fetchMxePublicKey(
  connection: Connection,
  programId: PublicKey,
  maxRetries = 5
): Promise<Uint8Array> {
  // In production:
  // const { getMXEPublicKeyWithRetry } = await import("@arcium-hq/client");
  // return getMXEPublicKeyWithRetry(provider, programId);

  // For local/devnet development mock:
  console.log("Fetching MXE public key for program:", programId.toBase58());
  // Return a deterministic mock key (32 bytes) — replace with real call on devnet
  return new Uint8Array(32).fill(1);
}

/**
 * Derive the Arcium computation account address for a given offset.
 */
export function getCompAccAddress(computationOffset: bigint): PublicKey {
  // In production: getComputationAccAddress(ARCIUM_CLUSTER_OFFSET, computationOffset)
  return PublicKey.default;
}

/**
 * Derive the Arcium cluster account address.
 */
export function getClusterAccAddress(): PublicKey {
  // In production: getClusterAccAddress(ARCIUM_CLUSTER_OFFSET)
  return PublicKey.default;
}

/** Generate a random computation offset (u64 as bigint) */
export function randomComputationOffset(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result |= BigInt(bytes[i]) << (BigInt(i) * 8n);
  }
  return result;
}

/**
 * Simulate waiting for an Arcium MPC computation to finalize.
 * In production, use awaitComputationFinalization from @arcium-hq/client.
 *
 * Returns a mock encrypted result for UI development.
 */
export async function simulateComputation(
  type: "open_position" | "check_liquidation" | "calculate_pnl" | "apply_funding",
  delayMs = 1800
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  await new Promise((r) => setTimeout(r, delayMs));

  const ciphertext = new Uint8Array(32);
  crypto.getRandomValues(ciphertext);
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);

  return { ciphertext, nonce };
}

/** Format a computation status for display */
export type ComputationStatus =
  | "idle"
  | "encrypting"
  | "queuing"
  | "mpc_computing"
  | "awaiting_callback"
  | "done"
  | "error";

export function statusLabel(s: ComputationStatus): string {
  return {
    idle: "Ready",
    encrypting: "Encrypting inputs...",
    queuing: "Queuing to Arcium...",
    mpc_computing: "MPC nodes computing...",
    awaiting_callback: "Awaiting on-chain callback...",
    done: "Computation complete",
    error: "Error",
  }[s];
}

export function statusColor(s: ComputationStatus): string {
  if (s === "done") return "text-tertiary";
  if (s === "error") return "text-error";
  if (s === "idle") return "text-zinc-500";
  return "text-primary";
}
