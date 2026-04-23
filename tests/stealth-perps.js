"use strict";
/**
 * stealth-perps — Integration Tests
 *
 * Tests the full flow: encrypt inputs → queue Arcium computation → await callback → decrypt result
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor = __importStar(require("@coral-xyz/anchor"));
const anchor_1 = require("@coral-xyz/anchor");
const client_1 = require("@arcium-hq/client");
const x25519 = __importStar(require("@stablelib/x25519"));
const crypto_1 = require("crypto");
const chai_1 = require("chai");
const os = __importStar(require("os"));
describe("stealth-perps", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.StealthPerps;
    const provider = anchor.getProvider();
    const arciumEnv = (0, client_1.getArciumEnv)();
    // ─── Helpers ──────────────────────────────────────────────────────────────
    /** Build the shared encryption context (x25519 + RescueCipher) */
    function buildEncryptionContext() {
        return __awaiter(this, void 0, void 0, function* () {
            const privateKey = x25519.utils.randomSecretKey();
            const publicKey = x25519.getPublicKey(privateKey);
            const mxePublicKey = yield (0, client_1.getMXEPublicKeyWithRetry)(provider, program.programId);
            const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
            const cipher = new client_1.RescueCipher(sharedSecret);
            return { privateKey, publicKey, cipher };
        });
    }
    /** Standard Arcium account addresses */
    function arciumAccounts(computationOffset) {
        return {
            mxeAccount: (0, client_1.getMXEAccAddress)(program.programId),
            mempoolAccount: (0, client_1.getMempoolAccAddress)(arciumEnv.arciumClusterOffset),
            executingPool: (0, client_1.getExecutingPoolAccAddress)(arciumEnv.arciumClusterOffset),
            clusterAccount: (0, client_1.getClusterAccAddress)(arciumEnv.arciumClusterOffset),
            computationAccount: (0, client_1.getComputationAccAddress)(arciumEnv.arciumClusterOffset, computationOffset),
        };
    }
    function compDefAddress(ixName) {
        return (0, client_1.getCompDefAccAddress)(program.programId, Buffer.from((0, client_1.getCompDefAccOffset)(ixName)).readUInt32LE());
    }
    const owner = (0, client_1.readKpJson)(`${os.homedir()}/.config/solana/id.json`);
    // ─── Initialization ───────────────────────────────────────────────────────
    it("Initializes computation definitions", () => __awaiter(void 0, void 0, void 0, function* () {
        // Initialize the Arcium computation definitions (once per deployment)
        console.log("Initializing open_position comp def...");
        yield program.methods
            .initOpenPositionCompDef()
            .accountsPartial({
            mxeAccount: (0, client_1.getMXEAccAddress)(program.programId),
            compDefAccount: compDefAddress("open_position"),
            clusterAccount: (0, client_1.getClusterAccAddress)(arciumEnv.arciumClusterOffset),
        })
            .rpc({ commitment: "confirmed" });
        console.log("Initializing check_liquidation comp def...");
        yield program.methods
            .initCheckLiquidationCompDef()
            .accountsPartial({
            mxeAccount: (0, client_1.getMXEAccAddress)(program.programId),
            compDefAccount: compDefAddress("check_liquidation"),
            clusterAccount: (0, client_1.getClusterAccAddress)(arciumEnv.arciumClusterOffset),
        })
            .rpc({ commitment: "confirmed" });
        console.log("Initializing calculate_pnl comp def...");
        yield program.methods
            .initCalculatePnlCompDef()
            .accountsPartial({
            mxeAccount: (0, client_1.getMXEAccAddress)(program.programId),
            compDefAccount: compDefAddress("calculate_pnl"),
            clusterAccount: (0, client_1.getClusterAccAddress)(arciumEnv.arciumClusterOffset),
        })
            .rpc({ commitment: "confirmed" });
        console.log("All comp defs initialized ✓");
    }));
    // ─── Test 1: Open Position ────────────────────────────────────────────────
    it("Opens a private position and verifies encrypted liq price is stored", () => __awaiter(void 0, void 0, void 0, function* () {
        const { publicKey, cipher } = yield buildEncryptionContext();
        // Position inputs (in μUSDC, i.e. × 1_000_000)
        const collateral = BigInt(1000000000); // 1000 USDC
        const size = BigInt(10000000); // 10 SOL worth
        const entryPrice = BigInt(142000000); // $142.00
        const leverageBps = BigInt(1000); // 10x
        const isLong = BigInt(1); // LONG
        const nonce = (0, crypto_1.randomBytes)(16);
        const plaintext = [collateral, size, entryPrice, leverageBps, isLong];
        const ciphertexts = cipher.encrypt(plaintext, nonce);
        const computationOffset = new anchor_1.BN((0, crypto_1.randomBytes)(8), "hex");
        const liqPriceEventPromise = (0, client_1.awaitEvent)("liqPriceStoredEvent", program);
        const sig = yield program.methods
            .openPosition(computationOffset, Array.from(ciphertexts[0]), Array.from(ciphertexts[1]), Array.from(ciphertexts[2]), Array.from(ciphertexts[3]), Array.from(ciphertexts[4]), Array.from(publicKey), new anchor_1.BN((0, client_1.deserializeLE)(nonce).toString()))
            .accountsPartial(Object.assign(Object.assign({}, arciumAccounts(computationOffset)), { compDefAccount: compDefAddress("open_position") }))
            .rpc({ commitment: "confirmed" });
        console.log(`open_position tx: ${sig}`);
        // Wait for Arcium MPC to compute and callback
        yield (0, client_1.awaitComputationFinalization)(provider, computationOffset, program.programId, "confirmed");
        const event = yield liqPriceEventPromise;
        console.log("Encrypted liq price stored on-chain ✓");
        console.log("Liq price ciphertext:", Buffer.from(event.liqPriceCt).toString("hex"));
        // Decrypt the liquidation price
        const decryptedLiqPrice = cipher.decrypt([event.liqPriceCt], new Uint8Array(event.nonce))[0];
        // Expected liq price for 10x LONG at $142: $142 * (1 - 1/10) = $127.80
        const expectedLiqPrice = BigInt(127800000); // approx $127.80 (× 1_000_000)
        console.log(`Decrypted liq price: $${Number(decryptedLiqPrice) / 1000000}`);
        // Allow 1% tolerance for integer math
        const diff = decryptedLiqPrice > expectedLiqPrice
            ? decryptedLiqPrice - expectedLiqPrice
            : expectedLiqPrice - decryptedLiqPrice;
        (0, chai_1.expect)(Number(diff)).to.be.lessThan(Number(expectedLiqPrice) * 0.01);
        console.log("Liquidation price within 1% tolerance ✓");
    }));
    // ─── Test 2: Liquidation Check ────────────────────────────────────────────
    it("Check liquidation circuit returns correct boolean privately", () => __awaiter(void 0, void 0, void 0, function* () {
        const { publicKey, cipher } = yield buildEncryptionContext();
        // Simulate a LONG position that SHOULD be liquidated (mark price < liq price)
        const collateral = BigInt(100000000); // 100 USDC
        const size = BigInt(5000000);
        const entryPrice = BigInt(100000000); // $100
        const leverageBps = BigInt(1000); // 10x
        const isLong = BigInt(1);
        // Liq price ≈ $90
        const markPrice = BigInt(85000000); // $85 — BELOW liq price → should liquidate
        const nonce = (0, crypto_1.randomBytes)(16);
        const ciphertexts = cipher.encrypt([collateral, size, entryPrice, leverageBps, isLong, markPrice], nonce);
        const computationOffset = new anchor_1.BN((0, crypto_1.randomBytes)(8), "hex");
        const resultEventPromise = (0, client_1.awaitEvent)("liquidationCheckResultEvent", program);
        yield program.methods
            .checkLiquidation(computationOffset, Array.from(ciphertexts[5]), // mark price ct
        50, // 0.5% maintenance margin
        Array.from(publicKey), new anchor_1.BN((0, client_1.deserializeLE)(nonce).toString()))
            .accountsPartial(Object.assign(Object.assign({}, arciumAccounts(computationOffset)), { compDefAccount: compDefAddress("check_liquidation") }))
            .rpc({ commitment: "confirmed" });
        yield (0, client_1.awaitComputationFinalization)(provider, computationOffset, program.programId, "confirmed");
        const event = yield resultEventPromise;
        const result = cipher.decrypt([event.resultCt], new Uint8Array(event.nonce))[0];
        console.log(`Liquidation check result: ${result} (1=liquidate, 0=healthy)`);
        (0, chai_1.expect)(Number(result)).to.equal(1); // Should be liquidatable
        console.log("Liquidation check correct ✓");
    }));
    // ─── Test 3: PnL Calculation ──────────────────────────────────────────────
    it("Calculate PnL circuit returns correct encrypted result", () => __awaiter(void 0, void 0, void 0, function* () {
        const { publicKey, cipher } = yield buildEncryptionContext();
        // 10x LONG, entered at $100, exiting at $120 → ~20% gain × 10x = 200% on collateral
        const collateral = BigInt(100000000); // 100 USDC
        const size = BigInt(10000000);
        const entryPrice = BigInt(100000000); // $100
        const exitPrice = BigInt(120000000); // $120
        const isLong = BigInt(1);
        const leverageBps = BigInt(1000);
        const fundingOwed = BigInt(0);
        const nonce = (0, crypto_1.randomBytes)(16);
        const ciphertexts = cipher.encrypt([collateral, size, entryPrice, exitPrice, isLong, leverageBps, fundingOwed], nonce);
        const computationOffset = new anchor_1.BN((0, crypto_1.randomBytes)(8), "hex");
        const closedEventPromise = (0, client_1.awaitEvent)("positionClosedEvent", program);
        yield (0, client_1.awaitComputationFinalization)(provider, computationOffset, program.programId, "confirmed");
        const event = yield closedEventPromise;
        const pnl = cipher.decrypt([event.pnlCt], new Uint8Array(event.pnlNonce))[0];
        console.log(`Decrypted PnL: $${Number(pnl) / 1000000}`);
        // Expected: (120-100)/100 * size * leverage/100 = 0.2 * 10M * 10 = 20M (μUSDC)
        const expectedPnl = BigInt(20000000);
        (0, chai_1.expect)(Number(pnl)).to.be.greaterThan(0);
        console.log("PnL calculation correct ✓");
    }));
});
