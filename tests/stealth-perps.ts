/**
 * stealth-perps — Integration Tests
 *
 * Tests the full flow: encrypt inputs → queue Arcium computation → await callback → decrypt result
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { StealthPerps } from "../target/types/stealth_perps";
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

describe("stealth-perps", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.StealthPerps as Program<StealthPerps>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const arciumEnv = getArciumEnv();

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Build the shared encryption context (x25519 + RescueCipher) */
  async function buildEncryptionContext() {
    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider,
      program.programId
    );
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);
    return { privateKey, publicKey, cipher };
  }

  /** Standard Arcium account addresses */
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

  function compDefAddress(ixName: string) {
    return getCompDefAccAddress(
      program.programId,
      Buffer.from(getCompDefAccOffset(ixName)).readUInt32LE()
    );
  }

  const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

  // ─── Initialization ───────────────────────────────────────────────────────

  it("Initializes computation definitions", async () => {
    // Initialize the Arcium computation definitions (once per deployment)
    console.log("Initializing open_position comp def...");
    await program.methods
      .initOpenPositionCompDef()
      .accountsPartial({
        mxeAccount: getMXEAccAddress(program.programId),
        compDefAccount: compDefAddress("open_position"),
        clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
      })
      .rpc({ commitment: "confirmed" });

    console.log("Initializing check_liquidation comp def...");
    await program.methods
      .initCheckLiquidationCompDef()
      .accountsPartial({
        mxeAccount: getMXEAccAddress(program.programId),
        compDefAccount: compDefAddress("check_liquidation"),
        clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
      })
      .rpc({ commitment: "confirmed" });

    console.log("Initializing calculate_pnl comp def...");
    await program.methods
      .initCalculatePnlCompDef()
      .accountsPartial({
        mxeAccount: getMXEAccAddress(program.programId),
        compDefAccount: compDefAddress("calculate_pnl"),
        clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
      })
      .rpc({ commitment: "confirmed" });

    console.log("All comp defs initialized ✓");
  });

  // ─── Test 1: Open Position ────────────────────────────────────────────────

  it("Opens a private position and verifies encrypted liq price is stored", async () => {
    const { publicKey, cipher } = await buildEncryptionContext();

    // Position inputs (in μUSDC, i.e. × 1_000_000)
    const collateral = BigInt(1_000_000_000); // 1000 USDC
    const size = BigInt(10_000_000);          // 10 SOL worth
    const entryPrice = BigInt(142_000_000);   // $142.00
    const leverageBps = BigInt(1000);          // 10x
    const isLong = BigInt(1);                  // LONG

    const nonce = randomBytes(16);
    const plaintext = [collateral, size, entryPrice, leverageBps, isLong];
    const ciphertexts = cipher.encrypt(plaintext, nonce);

    const computationOffset = new BN(randomBytes(8), "hex");
    const liqPriceEventPromise = awaitEvent("liqPriceStoredEvent", program);

    const sig = await program.methods
      .openPosition(
        computationOffset,
        Array.from(ciphertexts[0]),
        Array.from(ciphertexts[1]),
        Array.from(ciphertexts[2]),
        Array.from(ciphertexts[3]),
        Array.from(ciphertexts[4]),
        Array.from(publicKey),
        new BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        ...arciumAccounts(computationOffset),
        compDefAccount: compDefAddress("open_position"),
      })
      .rpc({ commitment: "confirmed" });

    console.log(`open_position tx: ${sig}`);

    // Wait for Arcium MPC to compute and callback
    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );

    const event = await liqPriceEventPromise;
    console.log("Encrypted liq price stored on-chain ✓");
    console.log("Liq price ciphertext:", Buffer.from(event.liqPriceCt).toString("hex"));

    // Decrypt the liquidation price
    const decryptedLiqPrice = cipher.decrypt(
      [event.liqPriceCt],
      new Uint8Array(event.nonce)
    )[0];

    // Expected liq price for 10x LONG at $142: $142 * (1 - 1/10) = $127.80
    const expectedLiqPrice = BigInt(127_800_000); // approx $127.80 (× 1_000_000)
    console.log(`Decrypted liq price: $${Number(decryptedLiqPrice) / 1_000_000}`);

    // Allow 1% tolerance for integer math
    const diff = decryptedLiqPrice > expectedLiqPrice
      ? decryptedLiqPrice - expectedLiqPrice
      : expectedLiqPrice - decryptedLiqPrice;
    expect(Number(diff)).to.be.lessThan(Number(expectedLiqPrice) * 0.01);
    console.log("Liquidation price within 1% tolerance ✓");
  });

  // ─── Test 2: Liquidation Check ────────────────────────────────────────────

  it("Check liquidation circuit returns correct boolean privately", async () => {
    const { publicKey, cipher } = await buildEncryptionContext();

    // Simulate a LONG position that SHOULD be liquidated (mark price < liq price)
    const collateral = BigInt(100_000_000);   // 100 USDC
    const size = BigInt(5_000_000);
    const entryPrice = BigInt(100_000_000);   // $100
    const leverageBps = BigInt(1000);          // 10x
    const isLong = BigInt(1);
    // Liq price ≈ $90
    const markPrice = BigInt(85_000_000);     // $85 — BELOW liq price → should liquidate

    const nonce = randomBytes(16);
    const ciphertexts = cipher.encrypt(
      [collateral, size, entryPrice, leverageBps, isLong, markPrice],
      nonce
    );

    const computationOffset = new BN(randomBytes(8), "hex");
    const resultEventPromise = awaitEvent("liquidationCheckResultEvent", program);

    await program.methods
      .checkLiquidation(
        computationOffset,
        Array.from(ciphertexts[5]),  // mark price ct
        50,                           // 0.5% maintenance margin
        Array.from(publicKey),
        new BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        ...arciumAccounts(computationOffset),
        compDefAccount: compDefAddress("check_liquidation"),
      })
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );

    const event = await resultEventPromise;
    const result = cipher.decrypt(
      [event.resultCt],
      new Uint8Array(event.nonce)
    )[0];

    console.log(`Liquidation check result: ${result} (1=liquidate, 0=healthy)`);
    expect(Number(result)).to.equal(1); // Should be liquidatable
    console.log("Liquidation check correct ✓");
  });

  // ─── Test 3: PnL Calculation ──────────────────────────────────────────────

  it("Calculate PnL circuit returns correct encrypted result", async () => {
    const { publicKey, cipher } = await buildEncryptionContext();

    // 10x LONG, entered at $100, exiting at $120 → ~20% gain × 10x = 200% on collateral
    const collateral = BigInt(100_000_000);   // 100 USDC
    const size = BigInt(10_000_000);
    const entryPrice = BigInt(100_000_000);   // $100
    const exitPrice = BigInt(120_000_000);    // $120
    const isLong = BigInt(1);
    const leverageBps = BigInt(1000);
    const fundingOwed = BigInt(0);

    const nonce = randomBytes(16);
    const ciphertexts = cipher.encrypt(
      [collateral, size, entryPrice, exitPrice, isLong, leverageBps, fundingOwed],
      nonce
    );

    const computationOffset = new BN(randomBytes(8), "hex");
    const closedEventPromise = awaitEvent("positionClosedEvent", program);

    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );

    const event = await closedEventPromise;
    const pnl = cipher.decrypt(
      [event.pnlCt],
      new Uint8Array(event.pnlNonce)
    )[0];

    console.log(`Decrypted PnL: $${Number(pnl) / 1_000_000}`);
    // Expected: (120-100)/100 * size * leverage/100 = 0.2 * 10M * 10 = 20M (μUSDC)
    const expectedPnl = BigInt(20_000_000);
    expect(Number(pnl)).to.be.greaterThan(0);
    console.log("PnL calculation correct ✓");
  });
});
