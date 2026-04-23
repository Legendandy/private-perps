/**
 * usePositions.ts
 *
 * React hook for managing private positions in Stealth Perps.
 * Positions are stored locally (encrypted blobs) and submitted to Solana.
 */

import { useState, useCallback } from "react";
import { formatCiphertext, generateNonce, mockEncrypt, u128FromBytes } from "../lib/encryption";
import { simulateComputation, randomComputationOffset, ComputationStatus } from "../lib/arcium";

export interface Position {
  id: string;
  market: string;
  direction: "LONG" | "SHORT";
  // These are NEVER stored plaintext on-chain — shown here for trader UX only
  collateralUsdc: number;
  sizeTokens: number;
  entryPrice: number;
  leverageX: number;
  // Encrypted values (what is stored on-chain)
  ct_collateral: string;
  ct_size: string;
  ct_entry_price: string;
  ct_leverage: string;
  ct_direction: string;
  ct_liq_price: string;
  // Derived / display
  liqPriceApprox: number; // decrypted client-side
  unrealizedPnl: number;  // decrypted client-side
  fundingOwed: number;
  status: "open" | "pending_close" | "closed" | "liquidated";
  openedAt: number; // unix ms
  computationOffset: string;
}

export interface OpenPositionParams {
  market: string;
  direction: "LONG" | "SHORT";
  collateralUsdc: number;
  sizeTokens: number;
  entryPrice: number;
  leverageX: number;
}

export function usePositions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [computationStatus, setComputationStatus] = useState<ComputationStatus>("idle");
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);

  const openPosition = useCallback(async (params: OpenPositionParams) => {
    setComputationStatus("encrypting");

    // Step 1: Generate ephemeral keypair and nonce
    const nonce = generateNonce();
    const offset = randomComputationOffset();
    const offsetStr = offset.toString(16).padStart(16, "0");

    // Step 2: Mock-encrypt position values (real: use RescueCipher)
    const ctCollateral = mockEncrypt(BigInt(Math.round(params.collateralUsdc * 1_000_000)));
    const ctSize = mockEncrypt(BigInt(Math.round(params.sizeTokens * 1_000_000)));
    const ctEntry = mockEncrypt(BigInt(Math.round(params.entryPrice * 1_000_000)));
    const ctLev = mockEncrypt(BigInt(params.leverageX * 100));
    const ctDir = mockEncrypt(params.direction === "LONG" ? 1n : 0n);

    setComputationStatus("queuing");

    // Step 3: Simulate sending to Solana + queuing Arcium computation
    await new Promise((r) => setTimeout(r, 600));

    setComputationStatus("mpc_computing");

    // Step 4: Simulate Arcium MPC computing liq price
    const { ciphertext: ctLiqPrice } = await simulateComputation("open_position", 1800);

    setComputationStatus("awaiting_callback");
    await new Promise((r) => setTimeout(r, 500));

    // Step 5: Derive approx liquidation price (in real app, decrypt from MPC result)
    const liqDistance = params.entryPrice / params.leverageX;
    const liqPriceApprox =
      params.direction === "LONG"
        ? params.entryPrice - liqDistance
        : params.entryPrice + liqDistance;

    // Step 6: Build position object (only for UI — NOT stored plaintext on-chain)
    const position: Position = {
      id: `pos_${offsetStr}`,
      market: params.market,
      direction: params.direction,
      collateralUsdc: params.collateralUsdc,
      sizeTokens: params.sizeTokens,
      entryPrice: params.entryPrice,
      leverageX: params.leverageX,
      ct_collateral: formatCiphertext(ctCollateral),
      ct_size: formatCiphertext(ctSize),
      ct_entry_price: formatCiphertext(ctEntry),
      ct_leverage: formatCiphertext(ctLev),
      ct_direction: formatCiphertext(ctDir),
      ct_liq_price: formatCiphertext(ctLiqPrice),
      liqPriceApprox,
      unrealizedPnl: 0,
      fundingOwed: 0,
      status: "open",
      openedAt: Date.now(),
      computationOffset: offsetStr,
    };

    setPositions((prev) => [position, ...prev]);
    setLastTxSig("sim_" + Math.random().toString(36).slice(2, 10));
    setComputationStatus("done");

    // Reset to idle after 2s
    setTimeout(() => setComputationStatus("idle"), 2000);

    return position;
  }, []);

  /** Update simulated PnL based on current mark price */
  const updatePnl = useCallback((marketPrices: Record<string, number>) => {
    setPositions((prev) =>
      prev.map((pos) => {
        if (pos.status !== "open") return pos;
        const mark = marketPrices[pos.market] ?? pos.entryPrice;
        const priceDiff =
          pos.direction === "LONG"
            ? mark - pos.entryPrice
            : pos.entryPrice - mark;
        const pnlPercent = priceDiff / pos.entryPrice;
        const unrealizedPnl = pos.collateralUsdc * pos.leverageX * pnlPercent;
        return { ...pos, unrealizedPnl };
      })
    );
  }, []);

  const closePosition = useCallback(async (positionId: string) => {
    setComputationStatus("encrypting");

    // Mark as pending
    setPositions((prev) =>
      prev.map((p) =>
        p.id === positionId ? { ...p, status: "pending_close" as const } : p
      )
    );

    setComputationStatus("mpc_computing");
    await simulateComputation("calculate_pnl", 2000);
    setComputationStatus("awaiting_callback");
    await new Promise((r) => setTimeout(r, 500));

    setPositions((prev) =>
      prev.map((p) =>
        p.id === positionId ? { ...p, status: "closed" as const } : p
      )
    );

    setComputationStatus("done");
    setTimeout(() => setComputationStatus("idle"), 2000);
  }, []);

  return {
    positions,
    computationStatus,
    lastTxSig,
    openPosition,
    closePosition,
    updatePnl,
  };
}
