/**
 * app/src/lib/programInstructions.ts
 *
 * Wrappers for all Solana program instructions.
 * Mirrors the pattern from veil-markets/src/utils/programInstructions.js
 * and arcium-auction/src/utils/programInstructions.js.
 *
 * Each function:
 *  1. Builds the required Arcium infrastructure accounts
 *  2. Submits the transaction
 *  3. Waits for MPC via backend API
 *  4. Listens for the callback event and decrypts the result
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getArciumEnv,
  getMXEAccAddress,
  getMempoolAccAddress,
  getClusterAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  awaitComputationFinalization,
} from "@arcium-hq/client";
import {
  encryptPositionInputs,
  encryptCloseInputs,
  decryptResult,
  waitForComputation,
  randomComputationOffset,
  type ComputationStatus,
} from "./arcium";
import { parsePrice, SCALE } from "./constants";
import type { StealthPerps } from "../idl/stealth_perps";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const arciumEnv = getArciumEnv();

function arciumAccounts(programId: PublicKey, computationOffset: BN) {
  return {
    mxeAccount: getMXEAccAddress(programId),
    mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
    executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
    clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
    computationAccount: getComputationAccAddress(
      arciumEnv.arciumClusterOffset,
      computationOffset
    ),
  };
}

function compDefAddress(programId: PublicKey, ixName: string) {
  return getCompDefAccAddress(
    programId,
    Buffer.from(getCompDefAccOffset(ixName)).readUInt32LE()
  );
}

function positionPda(
  programId: PublicKey,
  traderKey: PublicKey,
  computationOffset: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      traderKey.toBuffer(),
      computationOffset.toArrayLike(Buffer, "le", 8),
    ],
    programId
  );
}

// ─── open_position ────────────────────────────────────────────────────────────

export interface OpenPositionParams {
  collateralUsdc: bigint;   // raw UI value × SCALE
  size: bigint;
  entryPrice: bigint;
  leverageBps: bigint;      // e.g. 1000n for 10x
  isLong: boolean;
}

export interface OpenPositionResult {
  positionPda: PublicKey;
  computationOffset: BN;
  liqPriceDecrypted: bigint;   // decrypted liquidation price (× SCALE)
  txSig: string;
}

export async function openPosition(
  program: Program<StealthPerps>,
  wallet: anchor.web3.Keypair | anchor.AnchorProvider["wallet"],
  params: OpenPositionParams,
  onStatus?: (s: ComputationStatus) => void
): Promise<OpenPositionResult> {
  onStatus?.("encrypting");

  const encrypted = await encryptPositionInputs(
    params.collateralUsdc,
    params.size,
    params.entryPrice,
    params.leverageBps,
    params.isLong ? 1n : 0n
  );

  onStatus?.("queuing");
  const computationOffset = randomComputationOffset();
  const [position] = positionPda(
    program.programId,
    ("publicKey" in wallet ? wallet.publicKey : wallet.publicKey),
    computationOffset
  );

  // Set up event listener BEFORE the tx (to avoid missing rapid callbacks)
  let eventResolver: (value: any) => void;
  const eventPromise = new Promise<any>((resolve) => { eventResolver = resolve; });
  const listener = program.addEventListener("liqPriceStoredEvent", (event) => {
    if (event.position.equals(position)) {
      program.removeEventListener(listener);
      eventResolver(event);
    }
  });

  const txSig = await program.methods
    .openPosition(
      computationOffset,
      encrypted.ct_collateral,
      encrypted.ct_size,
      encrypted.ct_entry_price,
      encrypted.ct_leverage_bps,
      encrypted.ct_is_long,
      encrypted.pub_key,
      encrypted.nonce
    )
    .accountsPartial({
      trader: wallet.publicKey,
      position,
      ...arciumAccounts(program.programId, computationOffset),
      compDefAccount: compDefAddress(program.programId, "open_position"),
      systemProgram: SystemProgram.programId,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  onStatus?.("mpc_computing");

  // Wait for MPC — this calls awaitComputationFinalization via backend
  await waitForComputation(computationOffset, onStatus);

  onStatus?.("awaiting_callback");
  const event = await eventPromise;

  // Decrypt the liquidation price result
  const liqPriceDecrypted = await decryptResult(event.liqPriceCt, event.nonce);

  onStatus?.("done");

  return { positionPda: position, computationOffset, liqPriceDecrypted, txSig };
}

// ─── check_liquidation ─────────────────────────────────────────────────────────

export interface CheckLiquidationResult {
  isLiquidatable: boolean;
  txSig: string;
}

export async function checkLiquidation(
  program: Program<StealthPerps>,
  wallet: anchor.AnchorProvider["wallet"],
  positionAddress: PublicKey,
  markPrice: bigint,                 // current oracle price × SCALE
  maintenanceMarginBps: number,      // e.g. 50 = 0.5%
  onStatus?: (s: ComputationStatus) => void
): Promise<CheckLiquidationResult> {
  onStatus?.("encrypting");

  // Fetch existing position account to get the encrypted fields
  const positionAccount = await program.account.position.fetch(positionAddress);

  // Encrypt mark price (single value)
  const { encryptCloseInputs: _, ...arciumCtx } = await import("./arcium");
  const { getEncryptionContext } = await import("./arcium");
  const ctx = await getEncryptionContext();
  const { cipher, publicKey } = ctx;

  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const { deserializeLE } = await import("@arcium-hq/client");
  const cts = cipher.encrypt([markPrice], nonce);
  const ct_mark_price = Array.from(cts[0]);
  const noncebn = new anchor.BN(deserializeLE(nonce).toString());

  onStatus?.("queuing");
  const computationOffset = randomComputationOffset();
  const [liqCheckPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("liq_check"),
      positionAddress.toBuffer(),
      computationOffset.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

  let eventResolver: (v: any) => void;
  const eventPromise = new Promise<any>((res) => { eventResolver = res; });
  const listener = program.addEventListener("liquidationCheckResultEvent", (event) => {
    if (event.position.equals(positionAddress)) {
      program.removeEventListener(listener);
      eventResolver(event);
    }
  });

  const txSig = await program.methods
    .checkLiquidation(
      computationOffset,
      ct_mark_price,
      maintenanceMarginBps,
      Array.from(publicKey),
      noncebn
    )
    .accountsPartial({
      keeper: wallet.publicKey,
      position: positionAddress,
      liqCheck: liqCheckPda,
      ...arciumAccounts(program.programId, computationOffset),
      compDefAccount: compDefAddress(program.programId, "check_liquidation"),
      systemProgram: SystemProgram.programId,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  await waitForComputation(computationOffset, onStatus);

  const event = await eventPromise;
  const result = await decryptResult(event.resultCt, event.nonce);
  const isLiquidatable = result === 1n;

  onStatus?.("done");
  return { isLiquidatable, txSig };
}

// ─── close_position (calculate_pnl) ──────────────────────────────────────────

export interface ClosePositionResult {
  pnl: bigint;   // decrypted PnL × SCALE
  txSig: string;
}

export async function closePosition(
  program: Program<StealthPerps>,
  wallet: anchor.AnchorProvider["wallet"],
  positionAddress: PublicKey,
  exitPrice: bigint,
  fundingOwed: bigint,
  onStatus?: (s: ComputationStatus) => void
): Promise<ClosePositionResult> {
  onStatus?.("encrypting");

  const encrypted = await encryptCloseInputs(exitPrice, fundingOwed);

  onStatus?.("queuing");
  const computationOffset = randomComputationOffset();

  let eventResolver: (v: any) => void;
  const eventPromise = new Promise<any>((res) => { eventResolver = res; });
  const listener = program.addEventListener("positionClosedEvent", (event) => {
    if (event.position.equals(positionAddress)) {
      program.removeEventListener(listener);
      eventResolver(event);
    }
  });

  const txSig = await program.methods
    .closePosition(
      computationOffset,
      encrypted.ct_exit_price,
      encrypted.ct_funding_owed,
      encrypted.pub_key,
      encrypted.nonce
    )
    .accountsPartial({
      trader: wallet.publicKey,
      position: positionAddress,
      ...arciumAccounts(program.programId, computationOffset),
      compDefAccount: compDefAddress(program.programId, "calculate_pnl"),
      systemProgram: SystemProgram.programId,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  await waitForComputation(computationOffset, onStatus);

  const event = await eventPromise;
  const pnl = await decryptResult(event.pnlCt, event.pnlNonce);

  onStatus?.("done");
  return { pnl, txSig };
}
