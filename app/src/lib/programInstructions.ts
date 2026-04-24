/**
 * app/src/lib/programInstructions.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arciumAccounts(programId: PublicKey, computationOffset: BN) {
  return {
    mxeAccount: getMXEAccAddress(programId),
    mempoolAccount: getMempoolAccAddress(456),
    executingPool: getExecutingPoolAccAddress(456),
    clusterAccount: getClusterAccAddress(456),
    computationAccount: getComputationAccAddress(456, computationOffset),
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

// ─── open_position ─────────────────────────────────────────────────────────────

export interface OpenPositionParams {
  collateralUsdc: bigint;
  size: bigint;
  entryPrice: bigint;
  leverageBps: bigint;
  isLong: boolean;
}

export interface OpenPositionResult {
  positionPda: PublicKey;
  computationOffset: BN;
  liqPriceDecrypted: bigint;
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

  console.log("=== ENCRYPTED ===", {
    ct_collateral_len: encrypted.ct_collateral?.length,
    ct_size_len: encrypted.ct_size?.length,
    ct_entry_price_len: encrypted.ct_entry_price?.length,
    ct_leverage_bps_len: encrypted.ct_leverage_bps?.length,
    ct_is_long_len: encrypted.ct_is_long?.length,
    pub_key_len: encrypted.pub_key?.length,
    nonce: encrypted.nonce?.toString(),
  });

  onStatus?.("queuing");
  const computationOffset = randomComputationOffset();
  console.log("=== COMPUTATION OFFSET ===", computationOffset?.toString());

  const [position] = positionPda(
    program.programId,
    wallet.publicKey,
    computationOffset
  );

  const accounts = arciumAccounts(program.programId, computationOffset);
  const compDef = compDefAddress(program.programId, "open_position");

  console.log("=== ACCOUNTS ===", {
    programId: program.programId?.toString(),
    trader: wallet.publicKey?.toString(),
    position: position?.toString(),
    mxeAccount: accounts.mxeAccount?.toString(),
    mempoolAccount: accounts.mempoolAccount?.toString(),
    executingPool: accounts.executingPool?.toString(),
    clusterAccount: accounts.clusterAccount?.toString(),
    computationAccount: accounts.computationAccount?.toString(),
    compDefAccount: compDef?.toString(),
    systemProgram: SystemProgram.programId?.toString(),
  });

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
      ...accounts,
      compDefAccount: compDef,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  onStatus?.("mpc_computing");
  await waitForComputation(computationOffset, onStatus);
  onStatus?.("awaiting_callback");
  const event = await eventPromise;
  const liqPriceDecrypted = await decryptResult(event.liqPriceCt, event.nonce);
  onStatus?.("done");

  return { positionPda: position, computationOffset, liqPriceDecrypted, txSig };
}

// ─── check_liquidation ──────────────────────────────────────────────────────────

export interface CheckLiquidationResult {
  isLiquidatable: boolean;
  txSig: string;
}

export async function checkLiquidation(
  program: Program<StealthPerps>,
  wallet: anchor.AnchorProvider["wallet"],
  positionAddress: PublicKey,
  markPrice: bigint,
  maintenanceMarginBps: number,
  onStatus?: (s: ComputationStatus) => void
): Promise<CheckLiquidationResult> {
  onStatus?.("encrypting");

  const positionAccount = await program.account.position.fetch(positionAddress);

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

// ─── close_position (calculate_pnl) ────────────────────────────────────────────

export interface ClosePositionResult {
  pnl: bigint;
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