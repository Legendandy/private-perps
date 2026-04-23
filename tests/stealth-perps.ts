/**
 * tests/stealth-perps.ts
 *
 * Real integration tests — uses actual Arcium MPC, not mocks.
 * Run with: arcium test
 *
 * Each test:
 *  1. Builds x25519 keypair + derives shared secret from MXE public key
 *  2. Encrypts position inputs with RescueCipher
 *  3. Submits transaction that queues Arcium computation
 *  4. Waits for MPC to finalize (awaitComputationFinalization)
 *  5. Listens for callback event and decrypts the result
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import type { StealthPerps } from "../target/types/stealth_perps";
import {
  getArciumEnv,
  getMXEPublicKeyWithRetry,
  getMXEAccAddress,
  getMempoolAccAddress,
  getClusterAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  awaitComputationFinalization,
  awaitEvent,
  RescueCipher,
  deserializeLE,
  readKpJson,
} from "@arcium-hq/client";
import * as x25519 from "@stablelib/x25519";
import { randomBytes } from "crypto";
import { expect } from "chai";
import * as os from "os";

describe("stealth-perps (real Arcium MPC)", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.StealthPerps as Program<StealthPerps>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const arciumEnv = getArciumEnv();
  const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Build x25519 keypair + RescueCipher from MXE public key */
  async function buildCipher() {
    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    // Fetch the REAL MXE x25519 public key from the Solana account
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider,
      program.programId
    );
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);
    return { privateKey, publicKey, cipher, sharedSecret };
  }

  /** Standard Arcium infrastructure accounts needed for queue_computation */
  function arciumAccounts(computationOffset: BN) {
    return {
      mxeAccount: getMXEAccAddress(program.programId),
      mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
      executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
      clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
      computationAccount: getComputationAccAddress(
        arciumEnv.arciumClusterOffset,
        computationOffset
      ),
    };
  }

  /** Derive comp def PDA for a given instruction name */
  function compDefAddress(ixName: string) {
    return getCompDefAccAddress(
      program.programId,
      Buffer.from(getCompDefAccOffset(ixName)).readUInt32LE()
    );
  }

  // ─── Setup: Initialize Computation Definitions ────────────────────────────
  // This runs once per test suite (or after deploying a fresh program).

  before("Initialize computation definitions", async () => {
    const mxeAccount = getMXEAccAddress(program.programId);
    const clusterAccount = getClusterAccAddress(arciumEnv.arciumClusterOffset);

    const names = [
      "open_position",
      "check_liquidation",
      "calculate_pnl",
      "apply_funding",
    ] as const;
    const methods = [
      "initOpenPositionCompDef",
      "initCheckLiquidationCompDef",
      "initCalculatePnlCompDef",
      "initApplyFundingCompDef",
    ] as const;

    for (let i = 0; i < names.length; i++) {
      try {
        await (program.methods as any)
          [methods[i]]()
          .accountsPartial({
            payer: provider.wallet.publicKey,
            mxeAccount,
            compDefAccount: compDefAddress(names[i]),
            clusterAccount,
          })
          .rpc({ commitment: "confirmed" });
        console.log(`  ✓ ${names[i]} comp def initialized`);
      } catch (e: any) {
        if (e.message?.includes("already in use") || e.logs?.some((l: string) => l.includes("already in use"))) {
          console.log(`  ↳ ${names[i]} already initialized`);
        } else {
          throw e;
        }
      }
    }
  });

  // ─── Test 1: Open Position ─────────────────────────────────────────────────

  it("Opens a private position — MPC computes encrypted liq price", async () => {
    const { publicKey, cipher } = await buildCipher();

    // Position: 10x LONG SOL at $142, 1000 USDC collateral
    const collateral = 1_000_000_000n;   // 1000 USDC × 1_000_000
    const size       = 10_000_000n;      // 10 SOL
    const entryPrice = 142_000_000n;     // $142
    const leverageBps= 1_000n;           // 10x
    const isLong     = 1n;               // LONG

    const nonce = randomBytes(16);
    // RescueCipher.encrypt returns array of 32-byte ciphertext arrays
    const cts = cipher.encrypt([collateral, size, entryPrice, leverageBps, isLong], nonce);

    const computationOffset = new BN(randomBytes(8), "hex");
    // Set up event listener BEFORE submitting tx (race-condition safe)
    const liqPriceEvent = awaitEvent("liqPriceStoredEvent", program);

    // Derive the position PDA
    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        provider.wallet.publicKey.toBuffer(),
        computationOffset.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const sig = await program.methods
      .openPosition(
        computationOffset,
        Array.from(cts[0]),      // ct_collateral
        Array.from(cts[1]),      // ct_size
        Array.from(cts[2]),      // ct_entry_price
        Array.from(cts[3]),      // ct_leverage_bps
        Array.from(cts[4]),      // ct_is_long
        Array.from(publicKey),   // x25519 pub key
        new BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        trader: provider.wallet.publicKey,
        position: positionPda,
        ...arciumAccounts(computationOffset),
        compDefAccount: compDefAddress("open_position"),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    console.log("  open_position tx:", sig);

    // Wait for Arcium MPC to compute and execute the on-chain callback
    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );

    const event = await liqPriceEvent;
    console.log("  Encrypted liq price (hex):",
      Buffer.from(event.liqPriceCt).toString("hex").slice(0, 16) + "...");

    // Decrypt the liquidation price with our shared secret cipher
    const decrypted = cipher.decrypt(
      [event.liqPriceCt],
      new Uint8Array(Buffer.from(event.nonce.toString(16).padStart(32, "0"), "hex"))
    );
    const liqPrice = decrypted[0];

    // Expected: $142 * (1 - 1/10) = $127.80 → 127_800_000 μUSDC
    const expectedLiqPrice = 127_800_000n;
    console.log(`  Decrypted liq price: $${Number(liqPrice) / 1_000_000}`);
    expect(liqPrice).to.be.greaterThan(0n);
    const diff = liqPrice > expectedLiqPrice ? liqPrice - expectedLiqPrice : expectedLiqPrice - liqPrice;
    expect(Number(diff)).to.be.lessThan(Number(expectedLiqPrice) * 0.02);
    console.log("  ✓ Liq price within 2% tolerance");
  });

  // ─── Test 2: Liquidation Check ─────────────────────────────────────────────

  it("check_liquidation returns 1 (liquidatable) when mark < liq price", async () => {
    const { publicKey, cipher } = await buildCipher();

    // Position: 10x LONG at $100. Liq price ≈ $90.
    // Mark price = $85 → SHOULD liquidate
    const collateral  = 100_000_000n;
    const size        = 5_000_000n;
    const entryPrice  = 100_000_000n;
    const leverageBps = 1_000n;
    const isLong      = 1n;
    const markPrice   = 85_000_000n;   // $85 — below liq price
    const maintMarginBps = 50;          // 0.5%

    const nonce = randomBytes(16);
    // We encrypt all 6 fields together
    const cts = cipher.encrypt(
      [collateral, size, entryPrice, leverageBps, isLong, markPrice],
      nonce
    );

    const computationOffset = new BN(randomBytes(8), "hex");
    const resultEvent = awaitEvent("liquidationCheckResultEvent", program);

    // We need a position account — use a fresh one for this test
    // (In production the keeper would look up existing positions)
    const openOffset = new BN(randomBytes(8), "hex");
    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        provider.wallet.publicKey.toBuffer(),
        openOffset.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // First open the position so it exists
    const openNonce = randomBytes(16);
    const openCts = cipher.encrypt(
      [collateral, size, entryPrice, leverageBps, isLong],
      openNonce
    );
    await program.methods
      .openPosition(
        openOffset,
        Array.from(openCts[0]),
        Array.from(openCts[1]),
        Array.from(openCts[2]),
        Array.from(openCts[3]),
        Array.from(openCts[4]),
        Array.from(publicKey),
        new BN(deserializeLE(openNonce).toString())
      )
      .accountsPartial({
        trader: provider.wallet.publicKey,
        position: positionPda,
        ...arciumAccounts(openOffset),
        compDefAccount: compDefAddress("open_position"),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    await awaitComputationFinalization(provider, openOffset, program.programId, "confirmed");

    // Now run liquidation check
    const [liqCheckPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("liq_check"),
        positionPda.toBuffer(),
        computationOffset.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .checkLiquidation(
        computationOffset,
        Array.from(cts[5]),   // ct_mark_price
        maintMarginBps,
        Array.from(publicKey),
        new BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        keeper: provider.wallet.publicKey,
        position: positionPda,
        liqCheck: liqCheckPda,
        ...arciumAccounts(computationOffset),
        compDefAccount: compDefAddress("check_liquidation"),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    await awaitComputationFinalization(provider, computationOffset, program.programId, "confirmed");

    const event = await resultEvent;
    const decrypted = cipher.decrypt([event.resultCt], new Uint8Array(16));
    console.log(`  Liquidation result: ${decrypted[0]} (1=liquidate, 0=healthy)`);
    expect(Number(decrypted[0])).to.equal(1);
    console.log("  ✓ Correctly flagged as liquidatable");
  });

  // ─── Test 3: PnL Calculation ───────────────────────────────────────────────

  it("calculate_pnl returns positive PnL for 10x LONG that gained 20%", async () => {
    const { publicKey, cipher } = await buildCipher();

    // 10x LONG: entry $100, exit $120 → raw gain 20% × 10 = 200% on collateral
    // PnL = (120-100)/100 * size * leverage/100 = 0.2 * 10M * 10 = 20M μUSDC
    const collateral  = 100_000_000n;
    const size        = 10_000_000n;
    const entryPrice  = 100_000_000n;
    const exitPrice   = 120_000_000n;
    const isLong      = 1n;
    const leverageBps = 1_000n;
    const fundingOwed = 0n;

    const nonce = randomBytes(16);
    const cts = cipher.encrypt(
      [collateral, size, entryPrice, exitPrice, isLong, leverageBps, fundingOwed],
      nonce
    );

    // Open position first
    const openOffset = new BN(randomBytes(8), "hex");
    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        provider.wallet.publicKey.toBuffer(),
        openOffset.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const openNonce = randomBytes(16);
    const openCts = cipher.encrypt([collateral, size, entryPrice, leverageBps, isLong], openNonce);
    await program.methods
      .openPosition(
        openOffset,
        Array.from(openCts[0]), Array.from(openCts[1]), Array.from(openCts[2]),
        Array.from(openCts[3]), Array.from(openCts[4]),
        Array.from(publicKey),
        new BN(deserializeLE(openNonce).toString())
      )
      .accountsPartial({
        trader: provider.wallet.publicKey,
        position: positionPda,
        ...arciumAccounts(openOffset),
        compDefAccount: compDefAddress("open_position"),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(provider, openOffset, program.programId, "confirmed");

    // Now close
    const closeOffset = new BN(randomBytes(8), "hex");
    const closedEvent = awaitEvent("positionClosedEvent", program);

    await program.methods
      .closePosition(
        closeOffset,
        Array.from(cts[3]),   // ct_exit_price
        Array.from(cts[6]),   // ct_funding_owed
        Array.from(publicKey),
        new BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        trader: provider.wallet.publicKey,
        position: positionPda,
        ...arciumAccounts(closeOffset),
        compDefAccount: compDefAddress("calculate_pnl"),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    await awaitComputationFinalization(provider, closeOffset, program.programId, "confirmed");

    const event = await closedEvent;
    const decrypted = cipher.decrypt([event.pnlCt], new Uint8Array(16));
    const pnl = decrypted[0];
    console.log(`  Decrypted PnL: $${Number(pnl) / 1_000_000}`);
    expect(pnl).to.be.greaterThan(0n);
    console.log("  ✓ PnL is positive");
  });
});
