import * as anchor from "@coral-xyz/anchor";
import { BACKEND_API_BASE, PROGRAM_ID } from "./constants";

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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PositionEncrypted {
  ct_collateral: number[];
  ct_size: number[];
  ct_entry_price: number[];
  ct_leverage_bps: number[];
  ct_is_long: number[];
  pub_key: number[];
  nonce: anchor.BN;
}

export interface PnlEncrypted {
  ct_exit_price: number[];
  ct_funding_owed: number[];
  pub_key: number[];
  nonce: anchor.BN;
}

// ─── Encryption — delegated to backend (RescueCipher is Node-only) ────────────

export async function encryptPositionInputs(
  collateralUsdc: bigint,
  size: bigint,
  entryPrice: bigint,
  leverageBps: bigint,
  isLong: bigint
): Promise<PositionEncrypted> {
  const resp = await fetch(`${BACKEND_API_BASE}/api/arcium/encrypt-position`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: [
        collateralUsdc.toString(),
        size.toString(),
        entryPrice.toString(),
        leverageBps.toString(),
        isLong.toString(),
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(`Encrypt failed: ${err.error}`);
  }

  const data = await resp.json();
  return {
    ct_collateral:   data.ct_collateral,
    ct_size:         data.ct_size,
    ct_entry_price:  data.ct_entry_price,
    ct_leverage_bps: data.ct_leverage_bps,
    ct_is_long:      data.ct_is_long,
    pub_key:         data.pub_key,
    nonce:           new anchor.BN(data.nonce),
  };
}

export async function encryptCloseInputs(
  exitPrice: bigint,
  fundingOwed: bigint
): Promise<PnlEncrypted> {
  const resp = await fetch(`${BACKEND_API_BASE}/api/arcium/encrypt-close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: [
        exitPrice.toString(),
        fundingOwed.toString(),
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(`Encrypt close failed: ${err.error}`);
  }

  const data = await resp.json();
  return {
    ct_exit_price:   data.ct_exit_price,
    ct_funding_owed: data.ct_funding_owed,
    pub_key:         data.pub_key,
    nonce:           new anchor.BN(data.nonce),
  };
}

// ─── Decryption — also delegated to backend ───────────────────────────────────

export async function decryptResult(
  ciphertextArray: number[],
  nonceValue: anchor.BN | number
): Promise<bigint> {
  // For now return 0n — real decryption needs the shared secret which
  // was generated server-side. To fix properly: store shared secret
  // client-side per computation. For the demo this shows the flow works.
  // TODO: store pub/priv keypair client-side, pass pubkey to backend,
  // backend uses it to derive shared secret, client decrypts locally.
  return 0n;
}

// ─── Computation polling ──────────────────────────────────────────────────────

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
  onStatus?.("done");
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function randomComputationOffset(): anchor.BN {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result |= BigInt(bytes[i]) << (BigInt(i) * 8n);
  }
  return new anchor.BN(result.toString());
}

export function formatCiphertext(ct: number[]): string {
  return "0x" + ct.slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("") + "…";
}

export function parsePrice(s: string): bigint {
  const [whole = "0", frac = ""] = s.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(fracPadded);
}